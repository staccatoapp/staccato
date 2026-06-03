import type { FastifyReply, FastifyRequest } from "fastify";

export function createAuthPreHandler(apiKey: string) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
