import { z } from "zod";

export const UserSettingsSchema = z.object({
  listenbrainzToken: z.string().nullable(),
});
export const UpdateUserSettingsSchema = UserSettingsSchema.partial().strict();

export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;
