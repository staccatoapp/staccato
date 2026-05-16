import { FastifyPluginAsync } from "fastify";
import { resolutionProgress, startResolution } from "../resolver/index.js";

const resolutionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/resolve", async (req, res) => {
    if (resolutionProgress.running) {
      req.log.warn("resolution requested but already in progress");
      return res.status(409).send({ error: "Resolution already in progress" });
    }
    req.log.info("manual resolution triggered");
    startResolution().catch((err) =>
      req.log.error({ err }, "manual resolution failed"),
    );
    return res.status(202).send({ message: "Resolution started" });
  });

  fastify.get("/resolve/status", async () => ({
    ...resolutionProgress,
    startedAt: resolutionProgress.startedAt?.toISOString() ?? null,
    completedAt: resolutionProgress.completedAt?.toISOString() ?? null,
  }));
};

export default resolutionRoutes;
