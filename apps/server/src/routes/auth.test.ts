import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSetupComplete,
  createUser,
  findUserByUsername,
  findUserById,
  markOnboardingComplete,
} from "../db/queries/users.js";
import authRoutes from "./auth.js";
import { buildSessionApp } from "./__fixtures__/app.js";

// auth.ts imports session.ts which imports these at module level — neutralize them
// so the routes can be registered in isolation, matching the albums.test.ts pattern.
vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
// Stub argon2 to keep tests fast (real argon2id is intentionally slow).
// hash returns a stable string so the module-level DUMMY_HASH initialises cleanly.
// verify defaults to false (invalid credentials); override per-test for happy paths.
vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed-dummy"),
  verify: vi.fn().mockResolvedValue(false),
  argon2id: 2,
}));
vi.mock("../db/queries/users.js");

import * as argon2 from "argon2";

const mockUser = {
  id: "user-1",
  username: "admin",
  passwordHash: "hashed-password",
  isAdmin: true,
  onboardingComplete: false,
};

// buildSessionApp injects a fake session via onRequest (runs before every
// preHandler, including requireAuth) so the real @fastify/secure-session is
// never needed. Pass a userId to simulate an authenticated session; omit for
// unauthenticated.

const SETUP_BODY = { username: "admin", password: "password123" };
const LOGIN_BODY = { username: "admin", password: "password123" };

describe("GET /status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns setupComplete: false when setup has not run", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(false);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({ method: "GET", url: "/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ setupComplete: false });
  });

  it("returns setupComplete: true after setup has run", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(true);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({ method: "GET", url: "/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ setupComplete: true });
  });
});

describe("POST /setup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 409 when setup is already complete", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(true);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: SETUP_BODY,
    });
    expect(res.statusCode).toBe(409);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(false);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { notAUsername: true },
    });
    expect(res.statusCode).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("returns 201 with user shape and sets session on success", async () => {
    vi.mocked(isSetupComplete).mockReturnValue(false);
    vi.mocked(createUser).mockReturnValue(mockUser as never);
    const { app, session } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: SETUP_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: "user-1",
      username: "admin",
      isAdmin: true,
      onboardingComplete: false,
    });
    expect(session.set).toHaveBeenCalledWith("userId", "user-1");
  });
});

describe("POST /login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: { notAUsername: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when user is not found", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(undefined as never);
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: LOGIN_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when password is invalid", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(mockUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: LOGIN_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with user shape and sets session on valid credentials", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(mockUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { app, session } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: LOGIN_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "user-1",
      username: "admin",
      isAdmin: true,
      onboardingComplete: false,
    });
    expect(session.set).toHaveBeenCalledWith("userId", "user-1");
  });
});

describe("POST /logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({ method: "POST", url: "/logout" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 and deletes the session when authenticated", async () => {
    const { app, session } = buildSessionApp(authRoutes, "user-1");
    const res = await app.inject({ method: "POST", url: "/logout" });
    expect(res.statusCode).toBe(204);
    expect(session.delete).toHaveBeenCalled();
  });
});

describe("GET /me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when session userId has no matching user in the DB", async () => {
    vi.mocked(findUserById).mockReturnValue(undefined as never);
    const { app } = buildSessionApp(authRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 with user shape when session is valid", async () => {
    vi.mocked(findUserById).mockReturnValue(mockUser as never);
    const { app } = buildSessionApp(authRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "user-1",
      username: "admin",
      isAdmin: true,
      onboardingComplete: false,
    });
  });
});

describe("POST /complete-onboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/complete-onboarding",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with ok: true when authenticated", async () => {
    vi.mocked(markOnboardingComplete).mockReturnValue(undefined as never);
    const { app } = buildSessionApp(authRoutes, "user-1");
    const res = await app.inject({
      method: "POST",
      url: "/complete-onboarding",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
