import { resolveImageSource } from "../image-source";
import { createBlobStore } from "./blob-store";

/**
 * Durable, pinned on-disk store for offline downloads — track audio plus the
 * cover art needed to render a downloaded collection. Lives in the document dir
 * (survives OS cache pressure; only the user deletes it) with no `maxBytes`, so
 * nothing is evicted. Mirrors the artwork-cache policy module but durable.
 *
 * Keys: audio is `audio:<trackId>`; art is keyed by its resolved absolute uri
 * (so every track on an album shares one cover file).
 */
const store = createBlobStore({
  name: "downloads",
  baseDir: "document",
  indexKey: "staccato.downloads.index",
});

export interface DownloadSession {
  serverUrl: string;
  token: string;
}

/**
 * The local filename extension for a downloaded track. The server already sends
 * the real source container extension; this only normalises case and falls back
 * to `mp3` when it's missing.
 */
export function extensionForDownload(fileExtension: string | null): string {
  const trimmed = fileExtension?.trim();
  return trimmed ? trimmed.toLowerCase() : "mp3";
}

/**
 * Download a track's audio to durable storage and return its `file://` uri.
 * Keyed by track id; the extension is the source container so the player can
 * decode the local file (which carries no Content-Type). Throws on failure so
 * the caller can record the track as not-downloaded.
 */
export async function ensureTrackDownloaded(
  trackId: string,
  fileExtension: string | null,
  session: DownloadSession,
): Promise<string> {
  const url = `${session.serverUrl}/api/tracks/${trackId}/stream`;
  return store.ensure(`audio:${trackId}`, url, {
    headers: { Authorization: `Bearer ${session.token}` },
    extension: extensionForDownload(fileExtension),
  });
}

/**
 * The durable `file://` uri for an already-downloaded track, or null if it is
 * not downloaded. Never fetches — used by the player to prefer the local file.
 */
export function getDownloadedTrackUri(trackId: string): Promise<string | null> {
  return store.uri(`audio:${trackId}`);
}

/**
 * The durable `file://` uri for an already-pinned cover, or null if it is not
 * downloaded. Never fetches — keyed by the same resolved-uri scheme as
 * {@link ensureDownloadedArt}, so a cover pinned at download time is found here
 * even after a token refresh (the key excludes the bearer token). Used by
 * `useCachedImageSource` to render downloaded art offline.
 */
export function getDownloadedArtUri(
  coverArtUrl: string | null | undefined,
  session: DownloadSession | null | undefined,
): Promise<string | null> {
  const source = resolveImageSource(
    coverArtUrl,
    session?.serverUrl,
    session?.token,
  );
  if (!source) return Promise.resolve(null);
  return store.uri(source.uri);
}

/**
 * Download a downloaded collection's cover art to durable storage so it renders
 * with no network. Same auth/façade rules as the artwork cache (bearer header
 * for server-relative covers, none for absolute façade urls). Returns null on
 * no cover / no session / failure so callers just render no art.
 */
export async function ensureDownloadedArt(
  coverArtUrl: string | null | undefined,
  session: DownloadSession | null | undefined,
): Promise<string | null> {
  const source = resolveImageSource(
    coverArtUrl,
    session?.serverUrl,
    session?.token,
  );
  if (!source) return null;

  try {
    return await store.ensure(source.uri, source.uri, {
      headers: source.headers,
      extension: "jpg",
    });
  } catch (err) {
    console.warn("failed to cache downloaded artwork", { coverArtUrl, err });
    return null;
  }
}
