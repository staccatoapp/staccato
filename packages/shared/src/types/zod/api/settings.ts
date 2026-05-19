import { z } from "zod";

export const UpdateUserSettingsSchema = z
  .object({
    listenbrainzToken: z.string().nullable(),
    volume: z.number().int().min(0).max(100),
  })
  .partial()
  .strict();

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;
