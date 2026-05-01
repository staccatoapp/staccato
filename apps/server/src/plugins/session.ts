import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";

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
    secret: process.env.SESSION_SECRET!,
    salt: "peppery-staccato",
    cookieName: "staccato-session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
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

export default fp(sessionPlugin);
