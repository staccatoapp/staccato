import type { Config } from "../config.js";

export function makeTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    STACCATO_ENV: "test",
    PORT: 8280,
    STACCATO_DATA_DIR: "./data",
    STACCATO_SERVER_MUSIC_DIR: "./music",
    STACCATO_LOG_LEVEL: "error",
    STACCATO_LOG_FORMAT: "json",
    STACCATO_SERVER_SESSION_SECRET: "test-secret-that-is-at-least-32c",
    STACCATO_METADATA_URL: "http://localhost:8290/v1",
    STACCATO_METADATA_API_KEY: "",
    STACCATO_SERVER_LIBRARY_DISCOVERY_CONCURRENCY: 8,
    STACCATO_SERVER_LIBRARY_WORKER_CONCURRENCY: 6,
    STACCATO_SERVER_LIBRARY_ENRICHMENT_CONCURRENCY: 2,
    STACCATO_SERVER_FPCALC_PATH: "fpcalc",
    STACCATO_SERVER_ACOUSTID_API_KEY: "",
    MB_CONCURRENCY: 1,
    MB_INTERVAL_CAP: 1,
    MB_RATE_LIMIT_MS: 1100,
    ...overrides,
  };
}
