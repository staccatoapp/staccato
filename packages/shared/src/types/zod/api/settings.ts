import { z } from "zod";

export const UpdateUserSettingsSchema = z
  .object({
    listenbrainzToken: z.string().nullable(),
    volume: z.number().int().min(0).max(100),
  })
  .partial()
  .strict();

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;

// ─── GET /api/settings response ────────────────────────────
export const UserSettingsSchema = z.object({
  listenbrainzTokenSet: z.boolean(),
  volume: z.number(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const ServerSettingsSchema = z.object({
  metadataConfidenceThreshold: z.number(),
});
export type ServerSettings = z.infer<typeof ServerSettingsSchema>;
