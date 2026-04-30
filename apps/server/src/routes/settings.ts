import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { UpdateUserSettingsSchema } from "@staccato/shared";
import { validateToken } from "../listenbrainz/client.js";
import {
  getOrCreateUserSettings,
  updateUserSettings,
} from "../db/queries/settings.js";

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
        return reply.status(400).send({ error: "Invalid ListenBrainz token" });
      }
      cleanedUpdates.musicbrainzUsername = token.userName ?? null;
    }

    updateUserSettings(req.userId, cleanedUpdates);
    return reply.status(204).send();
  });

  fastify.post("/validate-listenbrainz-token", async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    return validateToken(token);
  });
};

export default settingsRoutes;
