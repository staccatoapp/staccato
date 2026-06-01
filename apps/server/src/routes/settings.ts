import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UpdateUserSettingsSchema } from "@staccato/shared";
import { validateToken } from "../listenbrainz/client.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";
import { getOrCreateServerSettings } from "../db/queries/server-settings.js";
import { reconcileUserRows } from "../recommendations/eligibility.js";
import { tick as recommendationTick } from "../recommendations/refresher.js";

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    const settings = getOrCreateUserSettings(req.userId);
    return {
      listenbrainzToken: settings.listenbrainzToken,
      volume: settings.volume,
    };
  });

  fastify.patch("/", async (req, reply) => {
    const parsedBody = UpdateUserSettingsSchema.safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn(
        { err: parsedBody.error },
        "PATCH /settings: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const parsedUpdates = parsedBody.data;
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
      // Reconcile removes rows for sources the user is no longer eligible for
      // (e.g. the ListenBrainz sources), leaving any other providers' rows intact.
      reconcileUserRows(getOrCreateUserSettings(req.userId));
      return reply.status(204).send();
    }

    updateUserSettings(req.userId, cleanedUpdates);

    if (tokenSetOrChanged) {
      // forceRefresh: credentials changed, so reset eligible rows to warming
      // and kick a tick to refetch with the new token.
      reconcileUserRows(getOrCreateUserSettings(req.userId), {
        forceRefresh: true,
      });
      void recommendationTick().catch((err) =>
        req.log.error(
          { err, userId: req.userId },
          "post-settings recommendation tick failed",
        ),
      );
    }

    return reply.status(204).send();
  });

  fastify.post("/validate-listenbrainz-token", async (req, reply) => {
    const parsedToken = z.object({ token: z.string() }).safeParse(req.body);
    if (!parsedToken.success) {
      req.log.warn(
        { err: parsedToken.error },
        "POST /settings/validate-listenbrainz-token: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { token } = parsedToken.data;
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
