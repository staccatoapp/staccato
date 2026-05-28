import {
  LidarrOptions,
  LidarrSettings,
  LidarrTestResult,
  TestLidarrConnectionSchema,
  UpdateLidarrSettingsSchema,
} from "@staccato/shared";
import { FastifyPluginAsync } from "fastify";
import { LidarrClient } from "../../lidarr/client.js";
import {
  getOrCreateServerSettings,
  ServerSettingsUpdate,
  updateServerSettings,
} from "../../db/queries/server-settings.js";

const lidarrRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    const response: LidarrSettings = {
      url: settings.lidarrUrl,
      apiKeySet: settings.lidarrApiKey != null,
      qualityProfileId: settings.lidarrQualityProfileId,
      metadataProfileId: settings.lidarrMetadataProfileId,
      rootFolderPath: settings.lidarrRootFolderPath,
    };
    return reply.send(response);
  });

  fastify.patch("/", async (req, reply) => {
    const body = UpdateLidarrSettingsSchema.parse(req.body);
    const update: ServerSettingsUpdate = {};
    if (body.url !== undefined) update.lidarrUrl = body.url ?? null;
    if (body.apiKey !== undefined) update.lidarrApiKey = body.apiKey ?? null;
    if (body.qualityProfileId !== undefined)
      update.lidarrQualityProfileId = body.qualityProfileId;
    if (body.metadataProfileId !== undefined)
      update.lidarrMetadataProfileId = body.metadataProfileId;
    if (body.rootFolderPath !== undefined)
      update.lidarrRootFolderPath = body.rootFolderPath;
    if (Object.keys(update).length > 0) updateServerSettings(update);
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
      const [qualityProfiles, metadataProfiles, rootFolders] =
        await Promise.all([
          client.getQualityProfiles(),
          client.getMetadataProfiles(),
          client.getRootFolders(),
        ]);
      const options: LidarrOptions = {
        qualityProfiles: qualityProfiles.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        metadataProfiles: metadataProfiles.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        rootFolders: rootFolders.map((r) => ({ id: r.id, path: r.path })),
      };
      const result: LidarrTestResult = { connected: true, options };
      return reply.send(result);
    } catch (err) {
      req.log.warn({ err }, "lidarr connected but option fetch failed");
      const result: LidarrTestResult = { connected: false, options: null };
      return reply.send(result);
    }
  });

  fastify.get("/connectivity", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    if (!settings.lidarrUrl || !settings.lidarrApiKey) {
      return reply.status(400).send({ error: "Lidarr not configured" });
    }
    const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);
    const connected = await client.testConnection();
    return reply.send({ connected });
  });

  fastify.get("/options", async (req, reply) => {
    const settings = getOrCreateServerSettings();
    if (!settings.lidarrUrl || !settings.lidarrApiKey) {
      return reply.status(400).send({ error: "Lidarr not configured" });
    }
    const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);
    try {
      const [qualityProfiles, metadataProfiles, rootFolders] =
        await Promise.all([
          client.getQualityProfiles(),
          client.getMetadataProfiles(),
          client.getRootFolders(),
        ]);
      const options: LidarrOptions = {
        qualityProfiles: qualityProfiles.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        metadataProfiles: metadataProfiles.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        rootFolders: rootFolders.map((r) => ({ id: r.id, path: r.path })),
      };
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
