import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { type DownloadableCollection } from "@/lib/downloadable";
import {
  ensureDownloadedArt,
  ensureTrackDownloaded,
  getDownloadedTrackUri,
  type DownloadSession,
} from "@/lib/storage/download-cache";

export type {
  DownloadableCollection,
  DownloadableTrack,
} from "@/lib/downloadable";

/** AsyncStorage key for the persisted per-collection download manifest. */
export const COLLECTIONS_KEY = "staccato.downloads.collections";

export type DownloadState = "idle" | "downloading" | "downloaded" | "partial";

export interface CollectionStatus {
  state: DownloadState;
  /** Tracks pulled so far — drives the determinate progress ring. */
  completed: number;
  total: number;
}

/** What we persist per downloaded collection so a relaunch can rehydrate it. */
interface ManifestEntry {
  id: string;
  kind: "playlist" | "album";
  name: string;
  coverArtUrls: string[];
  trackIds: string[];
  snapshot: unknown;
  downloadedAt: number;
}

type Manifest = Record<string, ManifestEntry>;

interface DownloadsState {
  /** Per-collection download status, keyed by collection id. */
  collections: Record<string, CollectionStatus>;
  /** trackId → durable `file://` uri, read synchronously by the player. */
  trackUris: Record<string, string>;
  /** Pull every owned track + cover art of a collection to the device. */
  download: (
    collection: DownloadableCollection,
    session: DownloadSession,
  ) => Promise<void>;
  /** Restore status + track uris from the persisted manifest on launch. */
  hydrate: () => Promise<void>;
}

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await AsyncStorage.getItem(COLLECTIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Manifest) : {};
  } catch (err) {
    console.warn("failed to read downloads manifest, starting empty", { err });
    return {};
  }
}

// Serialises manifest writes through a single promise chain. `download()` is
// fire-and-forgot, so two collections can finish concurrently; an unguarded
// read-modify-write would interleave (both read, both write, the later write
// drops the earlier entry). Chaining each read-modify-write runs them to
// completion one at a time. Each step swallows its own errors so the chain
// never rejects and can't wedge later writes.
let manifestWriteQueue: Promise<void> = Promise.resolve();

function writeManifestEntry(entry: ManifestEntry): Promise<void> {
  manifestWriteQueue = manifestWriteQueue.then(async () => {
    try {
      const manifest = await readManifest();
      manifest[entry.id] = entry;
      await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(manifest));
    } catch (err) {
      console.warn("failed to persist downloads manifest", {
        collectionId: entry.id,
        err,
      });
    }
  });
  return manifestWriteQueue;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  collections: {},
  trackUris: {},

  async download(collection, session) {
    const existing = get().collections[collection.id]?.state;
    // Don't re-run an in-flight or finished download (re-tap a partial to retry).
    if (existing === "downloading" || existing === "downloaded") return;

    const total = collection.tracks.length;
    const setStatus = (status: CollectionStatus) =>
      set((s) => ({
        collections: { ...s.collections, [collection.id]: status },
      }));

    // Seed progress from tracks already on disk so retrying a partial resumes
    // the ring instead of resetting it to 0/total. Tracked as a set of trackIds
    // so re-iterating an already-present track (blob-store returns it cheaply)
    // never double-counts.
    const downloaded = new Set(
      collection.tracks
        .filter((t) => get().trackUris[t.trackId])
        .map((t) => t.trackId),
    );
    setStatus({ state: "downloading", completed: downloaded.size, total });

    for (const track of collection.tracks) {
      try {
        const uri = await ensureTrackDownloaded(
          track.trackId,
          track.fileExtension,
          session,
        );
        downloaded.add(track.trackId);
        set((s) => ({
          trackUris: { ...s.trackUris, [track.trackId]: uri },
          collections: {
            ...s.collections,
            [collection.id]: {
              state: "downloading",
              completed: downloaded.size,
              total,
            },
          },
        }));
      } catch (err) {
        console.warn("failed to download track for offline play", {
          collectionId: collection.id,
          trackId: track.trackId,
          err,
        });
      }
    }

    // Cover art is best-effort; a missing cover never fails the download. Pin
    // both the collection covers (album cover / playlist mosaic) and each track's
    // own cover so a multi-album playlist renders fully offline (Phase 2). The
    // blob-store keys art by its resolved uri, so tracks sharing an album cover
    // dedupe to one file on disk.
    for (const coverArtUrl of collection.coverArtUrls) {
      await ensureDownloadedArt(coverArtUrl, session);
    }
    for (const track of collection.tracks) {
      await ensureDownloadedArt(track.coverArtUrl, session);
    }

    setStatus({
      state: downloaded.size === total ? "downloaded" : "partial",
      completed: downloaded.size,
      total,
    });

    await writeManifestEntry({
      id: collection.id,
      kind: collection.kind,
      name: collection.name,
      coverArtUrls: collection.coverArtUrls,
      trackIds: collection.tracks.map((t) => t.trackId),
      snapshot: collection.snapshot,
      downloadedAt: Date.now(),
    });
  },

  async hydrate() {
    const manifest = await readManifest();
    const collections: Record<string, CollectionStatus> = {};
    const trackUris: Record<string, string> = {};

    for (const entry of Object.values(manifest)) {
      let completed = 0;
      for (const trackId of entry.trackIds) {
        const uri = await getDownloadedTrackUri(trackId);
        if (uri) {
          trackUris[trackId] = uri;
          completed += 1;
        }
      }
      const total = entry.trackIds.length;
      collections[entry.id] = {
        state:
          completed === 0
            ? "idle"
            : completed === total
              ? "downloaded"
              : "partial",
        completed,
        total,
      };
    }

    set((s) => ({
      collections: { ...s.collections, ...collections },
      trackUris: { ...s.trackUris, ...trackUris },
    }));
  },
}));

const IDLE: CollectionStatus = { state: "idle", completed: 0, total: 0 };

/**
 * The download status for one collection. Selects the collection's own slice
 * only (a stable ref unless it changes), so unrelated downloads don't re-render
 * the button — and never returns a fresh object from the selector (zustand v5
 * has no snapshot caching, so the IDLE fallback is a module constant).
 */
export function useCollectionStatus(id: string): CollectionStatus {
  return useDownloadsStore((s) => s.collections[id]) ?? IDLE;
}
