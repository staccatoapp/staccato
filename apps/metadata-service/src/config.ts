import dotenvFlow from "dotenv-flow";
import { z } from "zod";

if (process.env.STACCATO_ENV !== "production") {
  dotenvFlow.config({
    node_env: process.env.STACCATO_ENV ?? "development",
  });
}

// Coerce a possibly-missing env string into an integer >= min, falling back
// when unset/invalid. min defaults to 0 (non-negative). Pass min=1 for any
// field used as a PQueue concurrency or intervalCap.
const intFromEnv = (fallback: number, min = 0) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= min ? n : fallback;
  }, z.number().int().min(min));

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
  STACCATO_ENV: z.string().optional(),
  STACCATO_LOG_LEVEL: z.string().default("info"),
  STACCATO_LOG_FORMAT: z.string().default("pretty"),
  // Upstream MusicBrainz ws/2 base. Defaults to the local Phase-1 mirror.
  MB_MIRROR_URL: z.string().url().default("http://localhost:5000/ws/2"),
  PORT: intFromEnv(8290),
  // Upstream throttle knobs. Defaults are OFF because we point at the mirror
  // (no rate limit). Re-enable (concurrency low, intervalCap=1, intervalMs~1100)
  // when pointing at public MusicBrainz.
  //   MIRROR_CONCURRENCY  — max simultaneous in-flight upstream requests
  //   MIRROR_INTERVAL_CAP — max requests started per interval (0 = uncapped)
  //   MIRROR_INTERVAL_MS  — interval window in ms (0 = no time-window cap)
  MIRROR_CONCURRENCY: intFromEnv(10, 1),
  MIRROR_INTERVAL_CAP: intFromEnv(0),
  MIRROR_INTERVAL_MS: intFromEnv(0),

  // ListenBrainz popularity (search ranking signal). Unauthenticated, global,
  // cacheable. POPULARITY_ENABLED lets the public service turn it off if abused;
  // when off (or on failure) search degrades to relevance-only ranking.
  LISTENBRAINZ_API_URL: z
    .string()
    .url()
    .default("https://api.listenbrainz.org/1"),
  POPULARITY_ENABLED: boolFromEnv(true),
  POPULARITY_TTL_MS: intFromEnv(24 * 60 * 60 * 1000), // 24h
  POPULARITY_TIMEOUT_MS: intFromEnv(4000),
  // Pre-shared secret checked on all /v1 routes. Empty string = auth disabled
  // (default, preserves zero-config dev). Set the same value in the server's
  // STACCATO_METADATA_API_KEY to authenticate server→metadata requests.
  METADATA_SERVICE_API_KEY: z.string().default(""),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Fatal: invalid metadata-service config\n" +
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const config = parsed.data;
