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
vi.mock("../db/queries/auth-tokens.js");

import * as argon2 from "argon2";
import {
  createAuthToken,
  deleteAuthToken,
  findAuthTokenByHash,
  updateAuthTokenLastUsed,
} from "../db/queries/auth-tokens.js";

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

  it("returns 400 when username exceeds 128 characters", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "a".repeat(129), password: "password123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when password exceeds 128 characters", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "a".repeat(129) },
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

const mockTokenRow = {
  id: "token-1",
  userId: "user-1",
  tokenHash: "stored-hash",
  deviceName: "Chris's iPhone",
  createdAt: new Date(),
  lastUsedAt: new Date(),
  expiresAt: null,
};

describe("POST /token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      payload: { notAUsername: true },
    });
    expect(res.statusCode).toBe(400);
    expect(createAuthToken).not.toHaveBeenCalled();
  });

  it("returns 401 on invalid credentials", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(mockUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      payload: LOGIN_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(createAuthToken).not.toHaveBeenCalled();
  });

  it("returns 201 with a token and user shape on valid credentials", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(mockUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createAuthToken).mockReturnValue(mockTokenRow as never);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      payload: { ...LOGIN_BODY, deviceName: "Chris's iPhone" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThanOrEqual(40);
    expect(body.user).toMatchObject({
      id: "user-1",
      username: "admin",
      isAdmin: true,
      onboardingComplete: false,
    });
  });

  it("stores only a sha-256 hash of the token, never the raw token", async () => {
    vi.mocked(findUserByUsername).mockReturnValue(mockUser as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(createAuthToken).mockReturnValue(mockTokenRow as never);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      payload: { ...LOGIN_BODY, deviceName: "Chris's iPhone" },
    });
    const rawToken = res.json().token as string;
    expect(createAuthToken).toHaveBeenCalledWith({
      userId: "user-1",
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      deviceName: "Chris's iPhone",
    });
    const storedHash = vi.mocked(createAuthToken).mock.calls[0]![0].tokenHash;
    expect(storedHash).not.toBe(rawToken);
  });
});

describe("DELETE /token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({ method: "DELETE", url: "/token" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when authenticated via session (no bearer token to revoke)", async () => {
    const { app } = buildSessionApp(authRoutes, "user-1");
    const res = await app.inject({ method: "DELETE", url: "/token" });
    expect(res.statusCode).toBe(400);
    expect(deleteAuthToken).not.toHaveBeenCalled();
  });

  it("returns 204 and deletes the token when authenticated via bearer", async () => {
    vi.mocked(findAuthTokenByHash).mockReturnValue(mockTokenRow as never);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "DELETE",
      url: "/token",
      headers: { authorization: "Bearer some-raw-token" },
    });
    expect(res.statusCode).toBe(204);
    expect(deleteAuthToken).toHaveBeenCalledWith("token-1");
  });
});

describe("bearer authentication via requireAuth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates a protected route with a valid bearer token", async () => {
    vi.mocked(findAuthTokenByHash).mockReturnValue(mockTokenRow as never);
    vi.mocked(findUserById).mockReturnValue(mockUser as never);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer some-raw-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "user-1", username: "admin" });
  });

  it("looks up the token by its sha-256 hash, not the raw value", async () => {
    vi.mocked(findAuthTokenByHash).mockReturnValue(mockTokenRow as never);
    vi.mocked(findUserById).mockReturnValue(mockUser as never);
    const { app } = buildSessionApp(authRoutes);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer some-raw-token" },
    });
    const lookedUpHash = vi.mocked(findAuthTokenByHash).mock.calls[0]![0];
    expect(lookedUpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lookedUpHash).not.toBe("some-raw-token");
  });

  it("updates lastUsedAt on successful bearer auth", async () => {
    vi.mocked(findAuthTokenByHash).mockReturnValue(mockTokenRow as never);
    vi.mocked(findUserById).mockReturnValue(mockUser as never);
    const { app } = buildSessionApp(authRoutes);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer some-raw-token" },
    });
    expect(updateAuthTokenLastUsed).toHaveBeenCalledWith("token-1");
  });

  it("returns 401 for an unknown bearer token", async () => {
    vi.mocked(findAuthTokenByHash).mockReturnValue(undefined);
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer bogus-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a malformed authorization header", async () => {
    const { app } = buildSessionApp(authRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.statusCode).toBe(401);
    expect(findAuthTokenByHash).not.toHaveBeenCalled();
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
