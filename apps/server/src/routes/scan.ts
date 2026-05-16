import { FastifyPluginAsync } from "fastify";
import { scanProgress, startScan } from "../scanner/index.js";

const scanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/scan", async (req, reply) => {
    if (scanProgress.running) {
      req.log.warn("scan requested but already in progress");
      return reply.status(409).send({ error: "Scan already in progress" });
    }
    const musicDir = process.env.MUSIC_DIR ?? "./music";
    req.log.info({ musicDir }, "manual scan triggered");
    startScan(musicDir).catch((err) =>
      req.log.error({ err }, "manual scan failed"),
    );
    return reply.status(202).send({ message: "Scan started" });
  });

  fastify.get("/scan/status", async () => ({
    ...scanProgress,
    startedAt: scanProgress.startedAt?.toISOString() ?? null,
    completedAt: scanProgress.completedAt?.toISOString() ?? null,
  }));
};

export default scanRoutes;
