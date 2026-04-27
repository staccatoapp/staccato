import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { db } from "../db/client.js";
import { users } from "../db/schema/users.js";
import { eq } from "drizzle-orm";

// TODO - refactor when auth is implemented
const defaultUserPlugin: FastifyPluginAsync = async (fastify) => {
  const defaultUser = db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1)
    .get();
  fastify.decorateRequest("userId", "");
  fastify.addHook("onRequest", async (request) => {
    request.userId = defaultUser?.id ?? "";
  });
};

export default fp(defaultUserPlugin);
