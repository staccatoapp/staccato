import dotenvFlow from "dotenv-flow";
import { z } from "zod";

if (process.env.STACCATO_ENV !== "production") {
  dotenvFlow.config({
    node_env: process.env.STACCATO_ENV ?? "development",
  });
}

const intFromEnv = (fallback: number, min = 0) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= min ? n : fallback;
  }, z.number().int().min(min));

const ConfigSchema = z.object({
  STACCATO_ENV: z.string().optional(),
  PORT: intFromEnv(8280),
  STACCATO_DATA_DIR: z.string().default("./data"),
  STACCATO_SERVER_MUSIC_DIR: z.string().default("./music"),
  STACCATO_LOG_LEVEL: z.string().default("info"),
  STACCATO_LOG_FORMAT: z.string().default("pretty"),
  STACCATO_SERVER_SESSION_SECRET: z.string().min(1),
  STACCATO_METADATA_URL: z.string().url().default("http://localhost:8290/v1"),
  STACCATO_SERVER_LIBRARY_DISCOVERY_CONCURRENCY: intFromEnv(8, 1),
  STACCATO_SERVER_LIBRARY_WORKER_CONCURRENCY: intFromEnv(6, 1),
  STACCATO_SERVER_LIBRARY_ENRICHMENT_CONCURRENCY: intFromEnv(2, 1),
  STACCATO_SERVER_FPCALC_PATH: z.string().default("fpcalc"),
  STACCATO_SERVER_ACOUSTID_API_KEY: z.string().default(""),
  MB_CONCURRENCY: intFromEnv(1, 1),
  MB_INTERVAL_CAP: intFromEnv(1, 1),
  MB_RATE_LIMIT_MS: intFromEnv(1100),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Fatal: invalid server config\n" +
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const config = parsed.data;
