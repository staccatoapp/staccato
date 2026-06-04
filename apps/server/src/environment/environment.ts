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

export const EnvironmentSchema = z.object({
  STACCATO_ENV: z.string().optional(),
  PORT: intFromEnv(8280),
  STACCATO_DATA_DIR: z.string().default("./data"),
  STACCATO_SERVER_MUSIC_DIR: z.string().default("./music"),
  STACCATO_LOG_LEVEL: z.string().default("info"),
  STACCATO_LOG_FORMAT: z.string().default("pretty"),
  STACCATO_SERVER_SESSION_SECRET: z
    .string()
    .min(32)
    .refine(
      (val) =>
        process.env.STACCATO_ENV === "test" ||
        val !== "change-this-to-a-random-32-plus-character-secret",
      {
        message:
          "Session secret must not be the default placeholder. Generate one with: openssl rand -base64 32",
      },
    ),
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

export type Environment = z.infer<typeof EnvironmentSchema>;

class EnvironmentError extends Error {
  constructor(fieldErrors: Record<string, string[] | undefined>) {
    super("Invalid server config\n" + JSON.stringify(fieldErrors, null, 2));
    this.name = "EnvironmentError";
  }
}

let cached: Environment | null = null;

/**
 * Parse and validate the full server environment from process.env, caching the
 * result. Throws EnvironmentError on invalid config — the composition root (or
 * Node) surfaces the message; we never process.exit here so the module stays
 * safe to import (e.g. under test, where it is mocked).
 */
export function getEnvironment(): Environment {
  if (cached) return cached;
  const parsed = EnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvironmentError(parsed.error.flatten().fieldErrors);
  }
  cached = parsed.data;
  return cached;
}

// Log settings are intentionally decoupled from getEnvironment: both fields
// have defaults and none are required, so this never throws. That lets
// logger.ts stay import-safe regardless of whether the full environment would
// validate.
const LogEnvironmentSchema = z.object({
  STACCATO_LOG_LEVEL: z.string().default("info"),
  STACCATO_LOG_FORMAT: z.string().default("pretty"),
});

export function getLogEnvironment() {
  return LogEnvironmentSchema.parse(process.env);
}
