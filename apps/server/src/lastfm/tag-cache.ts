import { getCachedTags, upsertCachedTags } from "../db/queries/lastfm-cache.js";
import { getTopTags } from "./client.js";
import type { LastfmEntityRef, LastfmEntityType, LastfmTag } from "./types.js";

// Tags change slowly; 30 days keeps the first-refresh fan-out from repeating.
export const TAG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Canonical cache key: MBID when present, else a normalised `artist|title`
 * (or `artist|album`) name key. Lowercased + trimmed so casing never splits
 * rows. */
export function entityKeyFor(ref: LastfmEntityRef): string {
  if (ref.mbid) return ref.mbid;
  const artist = (ref.artist ?? "").trim().toLowerCase();
  const name = (ref.title ?? ref.album ?? "").trim().toLowerCase();
  return `${artist}|${name}`;
}

/** Cache-through read of weighted tags for one entity. */
export async function getTagsCached(
  entityType: LastfmEntityType,
  ref: LastfmEntityRef,
  now: number = Date.now(),
): Promise<LastfmTag[]> {
  const key = entityKeyFor(ref);
  const cached = getCachedTags(entityType, key);
  if (cached && now - cached.fetchedAt < TAG_TTL_MS) {
    return JSON.parse(cached.tags) as LastfmTag[];
  }
  const tags = await getTopTags(entityType, ref);
  upsertCachedTags(entityType, key, tags, now);
  return tags;
}
