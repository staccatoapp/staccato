import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UpdateUserSettingsSchema } from "@staccato/shared";
import { validateToken } from "../listenbrainz/client.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";
import { getOrCreateServerSettings } from "../db/queries/server-settings.js";
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

  // TODO - refactor once there's dedicated admin server settings routes
  fastify.get("/server", async (_req, reply) => {
    const settings = getOrCreateServerSettings();
    return reply.send({
      metadataConfidenceThreshold: settings.metadataConfidenceThreshold,
    });
  });
};

export default settingsRoutes;
