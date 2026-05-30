import { z } from "zod";

export const DownloadRequestStatusSchema = z.enum([
  "requested",
  "sent_to_lidarr",
  "downloading",
  "completed",
  "failed",
]);
export type DownloadRequestStatus = z.infer<typeof DownloadRequestStatusSchema>;

export const DownloadRequestSchema = z.object({
  id: z.string(),
  releaseGroupMbid: z.string(),
  artistMbid: z.string(),
  artistName: z.string(),
  albumTitle: z.string().nullable(),
  status: DownloadRequestStatusSchema,
  errorMessage: z.string().nullable(),
  lidarrAlbumId: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type DownloadRequest = z.infer<typeof DownloadRequestSchema>;

export const CreateDownloadRequestSchema = z.object({
  releaseGroupMbid: z.string().min(1),
  artistMbid: z.string().min(1),
  artistName: z.string().min(1),
  albumTitle: z.string().nullable(),
  qualityProfileId: z.number().int().optional(),
});
export type CreateDownloadRequest = z.infer<typeof CreateDownloadRequestSchema>;

export const UpdateLidarrSettingsSchema = z
  .object({
    url: z.string().url().nullable(),
    apiKey: z.string().nullable(),
    qualityProfileId: z.number().int().nullable(),
    metadataProfileId: z.number().int().nullable(),
    rootFolderPath: z.string().nullable(),
  })
  .partial()
  .strict();
export type UpdateLidarrSettings = z.infer<typeof UpdateLidarrSettingsSchema>;

export const TestLidarrConnectionSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
});
export type TestLidarrConnection = z.infer<typeof TestLidarrConnectionSchema>;
