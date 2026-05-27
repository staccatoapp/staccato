import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  UpdateUserSettingsSchema,
  UpdateLidarrSettingsSchema,
  TestLidarrConnectionSchema,
  LidarrSettings,
  LidarrTestResult,
  LidarrOptions,
} from "@staccato/shared";
import { requireAdmin } from "../plugins/session.js";
import { validateToken } from "../listenbrainz/client.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";
import {
  getOrCreateServerSettings,
  updateServerSettings,
  type ServerSettingsUpdate,
} from "../db/queries/server-settings.js";
import { LidarrClient } from "../lidarr/client.js";
import {
  deleteForUser as deleteRecommendationCacheForUser,
  resetWarmingForUser,
  upsertWarmingRow,
} from "../db/queries/recommendation-cache.js";
import { listRegisteredSources } from "../recommendations/source.js";
import { tick as recommendationTick } from "../recommendations/refresher.js";
import "../recommendations/sources/index.js";

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    const settings = getOrCreateUserSettings(req.userId);
    return {
      listenbrainzToken: settings.listenbrainzToken,
      volume: settings.volume,
    };
  });

  fastify.patch("/", async (req, reply) => {
    const parsedUpdates = UpdateUserSettingsSchema.parse(req.body);
    const cleanedUpdates = Object.fromEntries(
      Object.entries(parsedUpdates).filter(([, value]) => value != null),
    );

    const currentUserSettings = getOrCreateUserSettings(req.userId);

    if (
      typeof cleanedUpdates.listenbrainzToken === "string" &&
      currentUserSettings.listenbrainzToken !== cleanedUpdates.listenbrainzToken
    ) {
      const token = await validateToken(cleanedUpdates.listenbrainzToken);
      if (!token.valid) {
        req.log.warn(
          { userId: req.userId },
          "invalid listenbrainz token submitted",
        );
        return reply.status(400).send({ error: "Invalid ListenBrainz token" });
      }
      if (!token.userName) {
        req.log.warn(
          { userId: req.userId },
          "listenbrainz token validated without username",
        );
        return reply
          .status(400)
          .send({ error: "ListenBrainz token has no associated username" });
      }
      cleanedUpdates.musicbrainzUsername = token.userName;
      req.log.info(
        { userId: req.userId, username: token.userName },
        "listenbrainz token validated",
      );
    }

    const previousToken = currentUserSettings.listenbrainzToken;
    const tokenCleared =
      "listenbrainzToken" in parsedUpdates &&
      parsedUpdates.listenbrainzToken === null &&
      previousToken != null;
    const tokenSetOrChanged =
      cleanedUpdates.listenbrainzToken !== undefined &&
      cleanedUpdates.listenbrainzToken !== previousToken;

    if (tokenCleared) {
      updateUserSettings(req.userId, {
        listenbrainzToken: null,
        musicbrainzUsername: null,
      });
      deleteRecommendationCacheForUser(req.userId);
      return reply.status(204).send();
    }

    updateUserSettings(req.userId, cleanedUpdates);

    if (tokenSetOrChanged) {
      const sources = listRegisteredSources();
      for (const source of sources) {
        upsertWarmingRow(req.userId, source.id, source.kind);
      }
      resetWarmingForUser(req.userId);
      void recommendationTick().catch((err) =>
        req.log.error(
          { err, userId: req.userId },
          "post-settings recommendation tick failed",
        ),
      );
    }

    return reply.status(204).send();
  });

  fastify.post("/validate-listenbrainz-token", async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    return validateToken(token);
  });

  fastify.get("/server", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    return reply.send({
      metadataConfidenceThreshold: settings.metadataConfidenceThreshold,
    });
  });

  fastify.get("/lidarr", async (_req, reply) => {
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

  fastify.patch("/lidarr", { preHandler: requireAdmin }, async (req, reply) => {
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

  fastify.post(
    "/lidarr/test",
    { preHandler: requireAdmin },
    async (req, reply) => {
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
    },
  );

  fastify.get("/lidarr/options", async (req, reply) => {
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

export default settingsRoutes;
