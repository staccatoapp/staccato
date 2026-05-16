import throttle from "p-throttle";
import { logger } from "../logger.js";

const log = logger.child({ module: "coverart" });

const CAA_BASE = "https://coverartarchive.org";

const throttledCaaFetch = throttle({ limit: 5, interval: 1000 })(
  (url: string) => fetch(url, { redirect: "manual" }),
);

const coverArtCache = new Map<string, string | null>();
const coverArtInflight = new Map<string, Promise<string | null>>();

export async function fetchCoverArtUrl(
  musicbrainzId: string,
): Promise<string | null> {
  return caaFetch(`${CAA_BASE}/release/${musicbrainzId}/front`);
}

// fallback for release groups - CAA sometimes has cover art here even when individual releases dont
export async function fetchCoverArtUrlForGroup(
  releaseGroupMbid: string,
): Promise<string | null> {
  return caaFetch(`${CAA_BASE}/release-group/${releaseGroupMbid}/front`);
}

async function caaFetch(url: string): Promise<string | null> {
  if (coverArtCache.has(url)) {
    return coverArtCache.get(url) ?? null;
  }
  const existing = coverArtInflight.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await throttledCaaFetch(url);
      if (res.status === 307 || res.status === 302) {
        return res.headers.get("location") ?? "";
      }
      return "";
    } catch (err) {
      log.warn({ err, url }, "cover art fetch failed");
      return null;
    }
  })();

  coverArtInflight.set(url, promise);
  try {
    const result = await promise;
    coverArtCache.set(url, result);
    return result;
  } finally {
    coverArtInflight.delete(url);
  }
}
