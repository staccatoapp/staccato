import { vi } from "vitest";
import { makeTestConfig } from "./src/config/__fixtures__/config.js";

// Mock config.ts globally for every test file. vi.mock in a setup file applies
// to all tests (see Vitest docs), so the real module — which runs dotenv-flow
// and would process-validate the environment — never executes under test. This
// keeps tests hermetic: no .env files, no process.env juggling. Individual
// tests can still override per-file with their own vi.mock + makeTestConfig({…}).
vi.mock("./src/config/config.js", () => ({
  getConfig: () => makeTestConfig(),
  getLogConfig: () => ({
    STACCATO_LOG_LEVEL: "error",
    STACCATO_LOG_FORMAT: "json",
  }),
}));
