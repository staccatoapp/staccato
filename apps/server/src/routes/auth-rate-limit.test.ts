import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import authRoutes from "./auth.js";
import { findUserByUsername, isSetupComplete } from "../db/queries/users.js";

// Do NOT mock fastify-plugin here — @fastify/rate-limit must retain its
// skip-override symbol so its onRoute hook is registered at the root scope
// and applies to routes inside the authRoutes child scope.
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed-dummy"),
  verify: vi.fn().mockResolvedValue(false),
  argon2id: 2,
}));
vi.mock("../db/queries/users.js");

const LOGIN_BODY = { username: "admin", password: "password123" };

function buildRateLimitedApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (req) => {
    (req as unknown as { session: object }).session = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
  });
  app.register(rateLimit, { global: false });
  app.register(authRoutes);
  return app;
}

describe("POST /login — rate limiting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 on the 11th request within the same window", async () => {
    const app = buildRateLimitedApp();
    vi.mocked(findUserByUsername).mockReturnValue(undefined as never);

    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: "POST",
        url: "/login",
        payload: LOGIN_BODY,
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: LOGIN_BODY,
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});

describe("POST /setup — rate limiting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 on the 11th request within the same window", async () => {
    const app = buildRateLimitedApp();
    vi.mocked(isSetupComplete).mockReturnValue(false);

    for (let i = 0; i < 10; i++) {
      await app.inject({
        method: "POST",
        url: "/setup",
        payload: { invalid: true },
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});

describe("GET /status — no rate limiting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not rate-limit requests to /status", async () => {
    const app = buildRateLimitedApp();
    vi.mocked(isSetupComplete).mockReturnValue(false);

    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: "GET", url: "/status" });
      expect(res.statusCode).toBe(200);
    }
  });
});
