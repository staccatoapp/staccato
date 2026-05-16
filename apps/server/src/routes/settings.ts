import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UpdateUserSettingsSchema, UpdateLidarrSettingsSchema, LidarrSettings } from "@staccato/shared";
import { validateToken } from "../listenbrainz/client.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";
import {
  getOrCreateServerSettings,
  updateServerSettings,
} from "../db/queries/server-settings.js";
import { LidarrClient } from "../lidarr/client.js";
import { playlistCache, trackCache } from "../recommendations/cache.js";

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    const settings = getOrCreateUserSettings(req.userId);
    return { listenbrainzToken: settings.listenbrainzToken };
  });

  fastify.patch("/", async (req, reply) => {
    const parsedUpdates = UpdateUserSettingsSchema.parse(req.body);
    const cleanedUpdates = Object.fromEntries(
      Object.entries(parsedUpdates).filter(([_, value]) => value != null),
    );

    const currentUserSettings = getOrCreateUserSettings(req.userId);

    if (
      cleanedUpdates.listenbrainzToken &&
      currentUserSettings.listenbrainzToken !== cleanedUpdates.listenbrainzToken
    ) {
      const token = await validateToken(cleanedUpdates.listenbrainzToken);
      if (!token.valid) {
        req.log.warn({ userId: req.userId }, "invalid listenbrainz token submitted");
        return reply.status(400).send({ error: "Invalid ListenBrainz token" });
      }
      cleanedUpdates.musicbrainzUsername = token.userName ?? null;
      req.log.info(
        { userId: req.userId, username: token.userName },
        "listenbrainz token validated",
      );
    }

    const tokenChanged =
      cleanedUpdates.listenbrainzToken !== undefined &&
      cleanedUpdates.listenbrainzToken !== currentUserSettings.listenbrainzToken;
    const usernameChanged =
      cleanedUpdates.musicbrainzUsername !== undefined &&
      cleanedUpdates.musicbrainzUsername !==
        currentUserSettings.musicbrainzUsername;

    updateUserSettings(req.userId, cleanedUpdates);

    if (tokenChanged || usernameChanged) {
      playlistCache.delete(req.userId);
      trackCache.delete(req.userId);
    }

    return reply.status(204).send();
  });

  fastify.post("/validate-listenbrainz-token", async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    return validateToken(token);
  });

  fastify.get("/lidarr", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    const response: LidarrSettings = {
      url: settings.lidarrUrl,
      apiKeySet: settings.lidarrApiKey != null,
    };
    return reply.send(response);
  });

  fastify.patch("/lidarr", async (req, reply) => {
    const body = UpdateLidarrSettingsSchema.parse(req.body);
    const update: Record<string, string | null> = {};
    if (body.url !== undefined) update.lidarrUrl = body.url ?? null;
    if (body.apiKey !== undefined) update.lidarrApiKey = body.apiKey ?? null;
    if (Object.keys(update).length > 0) updateServerSettings(update);
    return reply.status(204).send();
  });

  fastify.post("/lidarr/test", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    if (!settings.lidarrUrl || !settings.lidarrApiKey) {
      return reply.send({ connected: false });
    }
    const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);
    const connected = await client.testConnection();
    return reply.send({ connected });
  });
};

export default settingsRoutes;
