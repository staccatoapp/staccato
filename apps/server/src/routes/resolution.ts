import { FastifyPluginAsync } from "fastify";
import { resolutionProgress, startResolution } from "../resolver/index.js";

const resolutionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/resolve", async (_req, res) => {
    if (resolutionProgress.running) {
      return res.status(409).send({ error: "Resolution already in progress" });
    }
    startResolution();
    return res.status(202).send({ message: "Resolution started" });
  });

  fastify.get("/resolve/status", async () => ({
    ...resolutionProgress,
    startedAt: resolutionProgress.startedAt?.toISOString() ?? null,
    completedAt: resolutionProgress.completedAt?.toISOString() ?? null,
  }));
};

export default resolutionRoutes;
