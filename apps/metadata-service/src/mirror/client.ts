import PQueue from "p-queue";
import { config } from "../config.js";
import { MIRROR_USER_AGENT } from "../constants.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "mirror" });

// Throttle is configured from env. Defaults are OFF (pointing at the mirror,
// which has no rate limit). intervalCap/interval of 0 disable the time-window
// cap so only concurrency governs throughput. See config.ts for the knobs.
const queue = new PQueue({
  concurrency: config.MIRROR_CONCURRENCY,
  intervalCap: config.MIRROR_INTERVAL_CAP || Infinity,
  interval: config.MIRROR_INTERVAL_MS,
  carryoverConcurrencyCount: true,
});

// Fetch a ws/2 path (e.g. `/recording/<mbid>?inc=...&fmt=json`) from the
// upstream mirror, through the throttle queue.
export async function mirrorFetch(path: string): Promise<Response> {
  const url = `${config.MB_MIRROR_URL}${path}`;
  const res = await queue.add(() => {
    log.debug({ url }, "making mirror request");
    return fetch(url, {
      headers: {
        "User-Agent": MIRROR_USER_AGENT,
        Accept: "application/json",
      },
    });
  });
  if (!res) throw new Error("mirror queue returned no response");
  return res;
}
