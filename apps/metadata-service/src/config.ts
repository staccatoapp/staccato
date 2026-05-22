import { z } from "zod";
import { logger } from "./logger.js";

// Coerce a possibly-missing env string into a non-negative integer, falling
// back when unset/invalid.
const intFromEnv = (fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }, z.number().int().nonnegative());

// Coerce an env string into a boolean. Unset/invalid → fallback; "false"/"0"
// (case-insensitive) → false; anything else truthy → true.
const boolFromEnv = (fallback: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    const s = String(v).trim().toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
    if (s === "true" || s === "1" || s === "yes") return true;
    return fallback;
  }, z.boolean());

const ConfigSchema = z.object({
  // Upstream MusicBrainz ws/2 base. Defaults to the local Phase-1 mirror.
  MB_MIRROR_URL: z.string().url().default("http://localhost:5000/ws/2"),
  PORT: intFromEnv(8290),
  // Upstream throttle knobs. Defaults are OFF because we point at the mirror
  // (no rate limit). Re-enable (concurrency low, intervalCap=1, intervalMs~1100)
  // when pointing at public MusicBrainz.
  //   MIRROR_CONCURRENCY  — max simultaneous in-flight upstream requests
  //   MIRROR_INTERVAL_CAP — max requests started per interval (0 = uncapped)
  //   MIRROR_INTERVAL_MS  — interval window in ms (0 = no time-window cap)
  MIRROR_CONCURRENCY: intFromEnv(10),
  MIRROR_INTERVAL_CAP: intFromEnv(0),
  MIRROR_INTERVAL_MS: intFromEnv(0),

  // ListenBrainz popularity (search ranking signal). Unauthenticated, global,
  // cacheable. POPULARITY_ENABLED lets the public service turn it off if abused;
  // when off (or on failure) search degrades to relevance-only ranking.
  LISTENBRAINZ_API_URL: z.string().url().default("https://api.listenbrainz.org/1"),
  POPULARITY_ENABLED: boolFromEnv(true),
  POPULARITY_TTL_MS: intFromEnv(24 * 60 * 60 * 1000), // 24h
  POPULARITY_TIMEOUT_MS: intFromEnv(4000),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  logger.fatal({ issues: parsed.error.issues }, "invalid metadata-service config");
  process.exit(1);
}

export const config = parsed.data;

logger.info(
  {
    mirrorUrl: config.MB_MIRROR_URL,
    port: config.PORT,
    concurrency: config.MIRROR_CONCURRENCY,
    intervalCap: config.MIRROR_INTERVAL_CAP,
    intervalMs: config.MIRROR_INTERVAL_MS,
    popularityEnabled: config.POPULARITY_ENABLED,
    listenbrainzUrl: config.LISTENBRAINZ_API_URL,
  },
  "metadata-service config loaded",
);
