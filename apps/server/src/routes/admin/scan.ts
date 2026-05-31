import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getConfig } from "../../config/config.js";
import {
  libraryProgress,
  retryResolution,
  startManualScan,
} from "../../library/index.js";
import { countTracksByStatus } from "../../db/queries/tracks.js";

const retryBodySchema = z.object({
  scope: z.enum(["failed", "low_confidence"]),
  threshold: z.number().min(0).max(1).optional(),
});

const scanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/scan", async (req, reply) => {
    if (libraryProgress.running) {
      req.log.warn("scan requested but already in progress");
      return reply.status(409).send({ error: "Scan already in progress" });
    }
    const musicDir = getConfig().STACCATO_SERVER_MUSIC_DIR;
    req.log.info({ musicDir }, "manual scan triggered");
    startManualScan(musicDir).catch((err) =>
      req.log.error({ err }, "manual scan failed"),
    );
    return reply.status(202).send({ message: "Scan started" });
  });

  fastify.get("/scan/status", async () => {
    const counts = countTracksByStatus();
    return {
      ...libraryProgress,
      startedAt: libraryProgress.startedAt?.toISOString() ?? null,
      completedAt: libraryProgress.completedAt?.toISOString() ?? null,
      counts,
    };
  });

  fastify.post("/resolve/retry", async (req, reply) => {
    const parsed = retryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid retry options" });
    }
    const result = await retryResolution(parsed.data);
    return reply.status(202).send(result);
  });
};

export default scanRoutes;
