import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Override the global environment mock and neutralise dotenv-flow so we test
// the real schema, not the test-fixture shortcut from vitest.setup.ts.
vi.mock("dotenv-flow", () => ({ default: { config: vi.fn() } }));
vi.mock("./environment.js", async (importOriginal) => importOriginal());

import { EnvironmentSchema } from "./environment.js";

const VALID_SECRET = "a".repeat(32);
const PLACEHOLDER = "change-this-to-a-random-32-plus-character-secret";

describe("STACCATO_SERVER_SESSION_SECRET validation", () => {
  let savedStaccatoEnv: string | undefined;

  beforeEach(() => {
    savedStaccatoEnv = process.env.STACCATO_ENV;
  });

  afterEach(() => {
    if (savedStaccatoEnv === undefined) {
      delete process.env.STACCATO_ENV;
    } else {
      process.env.STACCATO_ENV = savedStaccatoEnv;
    }
  });

  it("rejects a secret shorter than 32 characters", () => {
    process.env.STACCATO_ENV = "production";
    const result = EnvironmentSchema.safeParse({
      STACCATO_SERVER_SESSION_SECRET: "tooshort",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a secret of exactly 32 characters", () => {
    process.env.STACCATO_ENV = "production";
    const result = EnvironmentSchema.safeParse({
      STACCATO_SERVER_SESSION_SECRET: VALID_SECRET,
    });
    expect(result.success).toBe(true);
  });

  it("rejects the placeholder secret in production", () => {
    process.env.STACCATO_ENV = "production";
    const result = EnvironmentSchema.safeParse({
      STACCATO_SERVER_SESSION_SECRET: PLACEHOLDER,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the placeholder secret in a non-production environment", () => {
    process.env.STACCATO_ENV = "test";
    const result = EnvironmentSchema.safeParse({
      STACCATO_SERVER_SESSION_SECRET: PLACEHOLDER,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a strong non-placeholder secret in production", () => {
    process.env.STACCATO_ENV = "production";
    const result = EnvironmentSchema.safeParse({
      STACCATO_SERVER_SESSION_SECRET: "my-very-secure-production-secret!x",
    });
    expect(result.success).toBe(true);
  });
});
