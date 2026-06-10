import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";
import { createHash } from "node:crypto";
import { getEnvironment } from "../environment/environment.js";
import { findUserById } from "../db/queries/users.js";
import {
  findAuthTokenByHash,
  updateAuthTokenLastUsed,
} from "../db/queries/auth-tokens.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId: string;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    /** Set when the request authenticated via a bearer token (mobile clients). */
    tokenId?: string;
  }
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(secureSession, {
    secret: getEnvironment().STACCATO_SERVER_SESSION_SECRET,
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
  // Web clients: session cookie (checked first — always present same-origin).
  const userId = request.session.get("userId");
  if (userId) {
    request.userId = userId;
    return;
  }

  // Mobile clients: Authorization: Bearer <opaque token>, looked up by hash.
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const rawToken = authorization.slice("Bearer ".length).trim();
    const tokenRow = rawToken
      ? findAuthTokenByHash(hashAuthToken(rawToken))
      : undefined;
    if (tokenRow) {
      request.userId = tokenRow.userId;
      request.tokenId = tokenRow.id;
      try {
        // Best-effort bookkeeping; never block or fail the request over it.
        updateAuthTokenLastUsed(tokenRow.id);
      } catch (err) {
        request.log.warn(
          { err, tokenId: tokenRow.id },
          "failed to update auth token lastUsedAt",
        );
      }
      return;
    }
  }

  return reply.code(401).send({ error: "Unauthorized" });
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
