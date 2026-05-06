import { z } from "zod";

export const CreateDownloadRequestSchema = z.object({
  recordingMbid: z.string().min(1),
});
export type CreateDownloadRequest = z.infer<typeof CreateDownloadRequestSchema>;

export const UpdateLidarrSettingsSchema = z
  .object({
    url: z.string().url().nullable(),
    apiKey: z.string().nullable(),
  })
  .partial()
  .strict();
export type UpdateLidarrSettings = z.infer<typeof UpdateLidarrSettingsSchema>;
