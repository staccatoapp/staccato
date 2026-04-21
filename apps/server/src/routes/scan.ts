import { FastifyPluginAsync } from "fastify";
import { scanProgress, startScan } from "../scanner/index.js";

const scanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/scan", async (_request, reply) => {
    if (scanProgress.running) {
      return reply.status(409).send({ error: "Scan already in progress" });
    }
    startScan(process.env.MUSIC_DIR ?? "./music");
    return reply.status(202).send({ message: "Scan started" });
  });

  fastify.get("/scan/status", async () => ({
    ...scanProgress,
    startedAt: scanProgress.startedAt?.toISOString() ?? null,
    completedAt: scanProgress.completedAt?.toISOString() ?? null,
  }));
};

export default scanRoutes;
