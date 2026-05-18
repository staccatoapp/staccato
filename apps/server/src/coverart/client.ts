import PQueue from "p-queue";
import { MB_PRIORITY, type MbPriority } from "../musicbrainz/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "coverart" });

const CAA_BASE = "https://coverartarchive.org";

const caaQueue = new PQueue({
  concurrency: 5,
  intervalCap: 5,
  interval: 1000,
  carryoverConcurrencyCount: true,
});

async function throttledCaaFetch(
  url: string,
  priority: MbPriority,
): Promise<Response> {
  if (priority === MB_PRIORITY.INTERACTIVE && caaQueue.size > 0) {
    log.debug(
      { queueSize: caaQueue.size, pending: caaQueue.pending },
      "interactive caa call queued behind backlog",
    );
  }
  const res = await caaQueue.add(
    () => fetch(url, { redirect: "manual" }),
    { priority },
  );
  if (!res) throw new Error("caa queue returned no response");
  return res;
}

const coverArtCache = new Map<string, string | null>();
const coverArtInflight = new Map<string, Promise<string | null>>();

export async function fetchCoverArtUrlForGroup(
  releaseGroupMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<string | null> {
  return caaFetch(`${CAA_BASE}/release-group/${releaseGroupMbid}/front`, priority);
}

async function caaFetch(url: string, priority: MbPriority): Promise<string | null> {
  if (coverArtCache.has(url)) {
    return coverArtCache.get(url) ?? null;
  }
  const existing = coverArtInflight.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await throttledCaaFetch(url, priority);
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
