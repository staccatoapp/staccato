import {
  LidarrSettings,
  LidarrTestResult,
  TestLidarrConnectionSchema,
  UpdateLidarrSettingsSchema,
} from "@staccato/shared";
import { FastifyPluginAsync } from "fastify";
import { fetchLidarrOptions, LidarrClient } from "../../lidarr/client.js";
import { serverConfig } from "../../config/server-config.js";
import type { LidarrConfig } from "../../config/server-config.js";

const lidarrRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_req, reply) => {
    const { lidarr } = serverConfig.get();
    const response: LidarrSettings = {
      url: lidarr.url,
      apiKeySet: lidarr.apiKey != null,
      qualityProfileId: lidarr.qualityProfileId,
      metadataProfileId: lidarr.metadataProfileId,
      rootFolderPath: lidarr.rootFolderPath,
    };
    return reply.send(response);
  });

  fastify.patch("/", async (req, reply) => {
    const parsed = UpdateLidarrSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn(
        { err: parsed.error },
        "PATCH /admin/lidarr: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const body = parsed.data;
    const lidarr: Partial<LidarrConfig> = {};
    if (body.url !== undefined) lidarr.url = body.url ?? null;
    if (body.apiKey !== undefined) lidarr.apiKey = body.apiKey ?? null;
    if (body.qualityProfileId !== undefined)
      lidarr.qualityProfileId = body.qualityProfileId;
    if (body.metadataProfileId !== undefined)
      lidarr.metadataProfileId = body.metadataProfileId;
    if (body.rootFolderPath !== undefined)
      lidarr.rootFolderPath = body.rootFolderPath;
    if (Object.keys(lidarr).length > 0) await serverConfig.set({ lidarr });
    return reply.status(204).send();
  });

  fastify.post("/test", async (req, reply) => {
    const body = TestLidarrConnectionSchema.parse(req.body);
    const client = new LidarrClient(body.url, body.apiKey);
    const connected = await client.testConnection();
    if (!connected) {
      const result: LidarrTestResult = { connected: false, options: null };
      return reply.send(result);
    }
    try {
      const options = await fetchLidarrOptions(client);
      const result: LidarrTestResult = { connected: true, options };
      return reply.send(result);
    } catch (err) {
      req.log.warn({ err }, "lidarr connected but option fetch failed");
      const result: LidarrTestResult = { connected: false, options: null };
      return reply.send(result);
    }
  });

  fastify.get("/connectivity", async (_req, reply) => {
    const { lidarr } = serverConfig.get();
    if (!lidarr.url || !lidarr.apiKey) {
      return reply.status(400).send({ error: "Lidarr not configured" });
    }
    const client = new LidarrClient(lidarr.url, lidarr.apiKey);
    const connected = await client.testConnection();
    return reply.send({ connected });
  });

  fastify.get("/options", async (req, reply) => {
    const { lidarr } = serverConfig.get();
    if (!lidarr.url || !lidarr.apiKey) {
      return reply.status(400).send({ error: "Lidarr not configured" });
    }
    const client = new LidarrClient(lidarr.url, lidarr.apiKey);
    try {
      const options = await fetchLidarrOptions(client);
      return reply.send(options);
    } catch (err) {
      req.log.warn({ err }, "lidarr options fetch failed");
      return reply
        .status(502)
        .send({ error: "Failed to fetch Lidarr options" });
    }
  });
};

export default lidarrRoutes;
