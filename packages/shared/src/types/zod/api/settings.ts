import { z } from "zod";

export const UpdateUserSettingsSchema = z
  .object({ listenbrainzToken: z.string().nullable() })
  .partial()
  .strict();

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;
