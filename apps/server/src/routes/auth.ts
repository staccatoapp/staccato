import { FastifyPluginAsync } from "fastify";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import {
  AuthenticatedUserResponseSchema,
  CreateTokenSchema,
  CreateUserSchema,
  LoginSchema,
  TokenResponseSchema,
} from "@staccato/shared";
import {
  createUser,
  findUserById,
  isSetupComplete,
  markOnboardingComplete,
} from "../db/queries/users.js";
import { createAuthToken, deleteAuthToken } from "../db/queries/auth-tokens.js";
import { hashAuthToken, requireAuth } from "../plugins/session.js";
import { verifyCredentials } from "../lib/verify-credentials.js";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/status", async () => {
    return { setupComplete: isSetupComplete() };
  });

  fastify.post("/setup", async (req, reply) => {
    if (isSetupComplete()) {
      req.log.warn("setup attempted but already complete");
      return reply.code(409).send({ error: "Setup already complete" });
    }
    const parsedBody = CreateUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn(
        { err: parsedBody.error },
        "POST /setup: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { username, password } = parsedBody.data;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = createUser({ username, passwordHash, isAdmin: true });
    req.session.set("userId", user.id);
    req.log.info(
      { userId: user.id, username: user.username },
      "initial admin user created",
    );
    return reply.code(201).send(
      AuthenticatedUserResponseSchema.parse({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        onboardingComplete: user.onboardingComplete,
      }),
    );
  });

  fastify.post("/login", async (req, reply) => {
    const parsedBody = LoginSchema.safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn(
        { err: parsedBody.error },
        "POST /login: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { username, password } = parsedBody.data;
    const user = await verifyCredentials(username, password, req.log);
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    req.session.set("userId", user.id);
    req.log.info(
      { userId: user.id, username: user.username },
      "user logged in",
    );
    return AuthenticatedUserResponseSchema.parse({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
    });
  });

  // Issues a long-lived opaque bearer token for mobile clients. The raw token
  // is returned exactly once; only its sha-256 hash is persisted.
  fastify.post("/token", async (req, reply) => {
    const parsedBody = CreateTokenSchema.safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn(
        { err: parsedBody.error },
        "POST /token: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { username, password, deviceName } = parsedBody.data;
    const user = await verifyCredentials(username, password, req.log);
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = randomBytes(32).toString("base64url");
    createAuthToken({
      userId: user.id,
      tokenHash: hashAuthToken(token),
      deviceName: deviceName ?? null,
    });
    req.log.info(
      { userId: user.id, username: user.username, deviceName },
      "api token issued",
    );
    return reply.code(201).send(
      TokenResponseSchema.parse({
        token,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          onboardingComplete: user.onboardingComplete,
        },
      }),
    );
  });

  // Revokes the bearer token used to authenticate this request (mobile sign-out).
  fastify.delete("/token", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.tokenId) {
      req.log.warn(
        { userId: req.userId },
        "DELETE /token: called without bearer authentication",
      );
      return reply.status(400).send({
        error: "Token revocation requires Bearer authentication",
      });
    }
    deleteAuthToken(req.tokenId);
    req.log.info(
      { tokenId: req.tokenId, userId: req.userId },
      "api token revoked",
    );
    return reply.code(204).send();
  });

  fastify.post("/logout", { preHandler: requireAuth }, async (req, reply) => {
    req.session.delete();
    return reply.code(204).send();
  });

  fastify.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    const user = findUserById(req.userId);
    if (!user) {
      req.log.warn({ userId: req.userId }, "GET /me: session userId not in db");
      return reply.code(404).send({ error: "User not found" });
    }
    return AuthenticatedUserResponseSchema.parse({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
    });
  });

  fastify.post(
    "/complete-onboarding",
    { preHandler: requireAuth },
    async (req) => {
      markOnboardingComplete(req.userId);
      return { ok: true };
    },
  );
};

export default authRoutes;
