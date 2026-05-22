import { z } from "zod";
import { config } from "../config.js";
import { MIRROR_USER_AGENT } from "../constants.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "popularity" });

// ListenBrainz popularity: global listen counts keyed by MBID. Unauthenticated,
// changes slowly → cached per-MBID with a long TTL so overlapping searches reuse
// counts and we stay a good citizen (≤3 batched calls per search). On disable or
// any failure this degrades silently to "unknown" (null → 0 in ranking).

export type PopularityKind = "recording" | "artist" | "release-group";

// release-group → release_group_mbid(s); recording → recording_mbid(s); etc.
function snake(kind: PopularityKind): string {
  return kind.replace(/-/g, "_");
}

const PopRowSchema = z
  .object({ total_listen_count: z.number().nullable().optional() })
  .passthrough();
const PopResponseSchema = z.array(PopRowSchema);

interface CacheEntry {
  value: number | null;
  expires: number;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(kind: PopularityKind, mbid: string): string {
  return `${kind}:${mbid}`;
}

// Fetch listen counts for a set of MBIDs. Returns a map mbid → listenCount
// (null when LB has no datum or the lookup failed). Cached entries are served
// without a network call; only the cache-miss MBIDs are requested in one batch.
export async function fetchPopularity(
  kind: PopularityKind,
  mbids: string[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const unique = Array.from(new Set(mbids.filter(Boolean)));
  if (!config.POPULARITY_ENABLED || unique.length === 0) {
    for (const m of unique) result.set(m, null);
    return result;
  }

  const now = Date.now();
  const misses: string[] = [];
  for (const mbid of unique) {
    const hit = cache.get(cacheKey(kind, mbid));
    if (hit && hit.expires > now) {
      result.set(mbid, hit.value);
    } else {
      misses.push(mbid);
    }
  }
  if (misses.length === 0) return result;

  const mbidKey = `${snake(kind)}_mbids`;
  const rowKey = `${snake(kind)}_mbid`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.POPULARITY_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${config.LISTENBRAINZ_API_URL}/popularity/${kind}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": MIRROR_USER_AGENT,
      },
      body: JSON.stringify({ [mbidKey]: misses }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn(
        { status: res.status, kind, count: misses.length },
        "listenbrainz popularity non-ok response",
      );
      for (const m of misses) result.set(m, null);
      return result;
    }
    const rows = PopResponseSchema.parse(await res.json());
    const fromApi = new Map<string, number | null>();
    for (const row of rows) {
      const mbid = row[rowKey];
      if (typeof mbid === "string") {
        fromApi.set(mbid, row.total_listen_count ?? null);
      }
    }
    const expires = now + config.POPULARITY_TTL_MS;
    for (const mbid of misses) {
      const value = fromApi.get(mbid) ?? null;
      cache.set(cacheKey(kind, mbid), { value, expires });
      result.set(mbid, value);
    }
    return result;
  } catch (err) {
    log.warn(
      { err, kind, count: misses.length },
      "listenbrainz popularity fetch failed",
    );
    for (const m of misses) result.set(m, null);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
