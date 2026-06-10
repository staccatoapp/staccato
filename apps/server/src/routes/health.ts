import { FastifyPluginAsync } from "fastify";
import { createRequire } from "node:module";
import { HealthResponseSchema } from "@staccato/shared";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

// Public handshake endpoint for clients (web + mobile). `name` is a fixed
// product identifier so the mobile app can verify it's talking to a real
// Staccato server before prompting for credentials.
//
// Note: no CORS is configured deliberately — native mobile clients don't
// enforce CORS, and the web SPA is served same-origin.
const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/health", async () => {
    return HealthResponseSchema.parse({
      status: "ok",
      name: "staccato",
      version,
    });
  });
};

export default healthRoutes;
