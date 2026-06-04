import { vi } from "vitest";
import { makeTestEnvironment } from "./src/config/__fixtures__/environment.js";

// Mock environment.ts globally for every test file. vi.mock in a setup file
// applies to all tests (see Vitest docs), so the real module — which runs
// dotenv-flow and would process-validate the environment — never executes under
// test. This keeps tests hermetic: no .env files, no process.env juggling.
// Individual tests can still override per-file with their own vi.mock +
// makeTestEnvironment({…}).
vi.mock("./src/environment/environment.js", () => ({
  getEnvironment: () => makeTestEnvironment(),
  getLogEnvironment: () => ({
    STACCATO_LOG_LEVEL: "error",
    STACCATO_LOG_FORMAT: "json",
  }),
}));
