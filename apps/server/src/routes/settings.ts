import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema/user-settings.js";
import { eq } from "drizzle-orm";
import { UpdateUserSettingsSchema } from "@staccato/shared";
import { validateToken } from "../listenbrainz/client.js";

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    return getOrCreateUserSettings(req.userId);
  });

  fastify.patch("/", async (req, reply) => {
    const parsedUpdates = UpdateUserSettingsSchema.parse(req.body);
    const cleanedUpdates = Object.fromEntries(
      Object.entries(parsedUpdates).filter(([_, value]) => value != null),
    );

    const currentUserSettings = getOrCreateUserSettings(req.userId); // TODO - hack to create user settings before we try to update it. should probably be refactored

    if (
      cleanedUpdates.listenbrainzToken &&
      currentUserSettings.listenbrainzToken !== cleanedUpdates.listenbrainzToken
    ) {
      const token = await validateToken(cleanedUpdates.listenbrainzToken);
      if (!token.valid) {
        return reply.status(400).send({ error: "Invalid ListenBrainz token" });
      }
    }
    db.update(userSettings)
      .set(cleanedUpdates)
      .where(eq(userSettings.userId, req.userId))
      .run();

    return reply.status(204).send();
  });

  fastify.post("/validate-listenbrainz-token", async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    return validateToken(token);
  });
};

function getOrCreateUserSettings(userId: string) {
  return (
    db // TODO - should probably make queries async
      .insert(userSettings)
      .values({
        userId,
      })
      // no op update - effectively a get-or-create
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          userId,
        },
      })
      .returning()
      .get()
  );
}

export default settingsRoutes;
