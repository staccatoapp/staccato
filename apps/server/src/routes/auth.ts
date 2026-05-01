import { FastifyPluginAsync } from "fastify";
import * as argon2 from "argon2";
import { LoginSchema, SetupSchema } from "@staccato/shared";
import {
  createUser,
  findUserById,
  findUserByUsername,
  isSetupComplete,
  markOnboardingComplete,
} from "../db/queries/users.js";
import { requireAuth } from "../plugins/session.js";

const DUMMY_HASH = await argon2.hash("dummy-password-for-timing-safety");

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/status", async () => {
    return { setupComplete: isSetupComplete() };
  });

  fastify.post("/setup", async (req, reply) => {
    if (isSetupComplete()) {
      return reply.code(409).send({ error: "Setup already complete" });
    }
    const { username, password } = SetupSchema.parse(req.body);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = createUser({ username, passwordHash, isAdmin: true });
    req.session.set("userId", user.id);
    return reply
      .code(201)
      .send({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        onboardingComplete: user.onboardingComplete,
      });
  });

  fastify.post("/login", async (req, reply) => {
    const { username, password } = LoginSchema.parse(req.body);
    const user = findUserByUsername(username);

    // Always run a hash verification to prevent timing attacks
    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const valid = await argon2.verify(hashToVerify, password);

    if (!user || !user.passwordHash || !valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    req.session.set("userId", user.id);
    return {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
    };
  });

  fastify.post("/logout", { preHandler: requireAuth }, async (req, reply) => {
    req.session.delete();
    return reply.code(204).send();
  });

  fastify.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    const user = findUserById(req.userId);
    if (!user) return reply.code(404).send({ error: "User not found" });
    return {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
    };
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
