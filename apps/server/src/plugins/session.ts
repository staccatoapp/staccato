import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";
import { getConfig } from "../config/config.js";
import { findUserById } from "../db/queries/users.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId: string;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(secureSession, {
    secret: getConfig().STACCATO_SERVER_SESSION_SECRET,
    salt: "peppery-staccato",
    cookieName: "staccato-session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: getConfig().STACCATO_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  });

  fastify.decorateRequest("userId", "");
};

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.session.get("userId");
  if (!userId) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  request.userId = userId;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = findUserById(request.userId);
  if (!user?.isAdmin) {
    request.log.warn(
      { userId: request.userId },
      "admin-only route accessed by non-admin",
    );
    return reply.code(403).send({ error: "Forbidden" });
  }
}

export default fp(sessionPlugin);
