import { resolveImageSource } from "../image-source";
import { createBlobStore } from "./blob-store";

/** ~50 MB is plenty for cover art; the OS may still reclaim the cache dir. */
const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;

const store = createBlobStore({
  name: "artwork",
  baseDir: "cache",
  indexKey: "staccato.artworkCache.index",
  maxBytes: MAX_ARTWORK_BYTES,
});

/**
 * Download a track's cover art to a local file and return its `file://` uri,
 * so it can be handed to the lock screen (which cannot send the Bearer header
 * the server-relative cover URLs require). Returns null when there is no cover,
 * no session, or the download fails — callers then render no artwork.
 *
 * Keyed by the resolved absolute uri, so every track on an album shares one
 * cached file.
 */
export async function ensureArtworkFile(
  coverArtUrl: string | null | undefined,
  session: { serverUrl: string; token: string } | null | undefined,
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
    });
  } catch (err) {
    console.warn("failed to cache artwork for lock screen", {
      coverArtUrl,
      err,
    });
    return null;
  }
}

/**
 * The transient-cache `file://` uri for an already-fetched cover, or null if it
 * is not cached. Never fetches — the second tier (after the durable downloads
 * store) consulted by `useCachedImageSource`. Keyed by the resolved uri, the
 * same scheme {@link ensureArtworkFile} writes under.
 */
export function getArtworkFileUri(
  coverArtUrl: string | null | undefined,
  session: { serverUrl: string; token: string } | null | undefined,
): Promise<string | null> {
  const source = resolveImageSource(
    coverArtUrl,
    session?.serverUrl,
    session?.token,
  );
  if (!source) return Promise.resolve(null);
  return store.uri(source.uri);
}
