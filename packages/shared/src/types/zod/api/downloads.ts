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

// ─── Response schemas ───────────────────────────────────────
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
  lidarrAlbumId: z.number().nullable(),
  createdAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date().nullable(),
});
export type DownloadRequest = z.infer<typeof DownloadRequestSchema>;

export const LidarrProfileOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type LidarrProfileOption = z.infer<typeof LidarrProfileOptionSchema>;

export const LidarrRootFolderOptionSchema = z.object({
  id: z.number(),
  path: z.string(),
});
export type LidarrRootFolderOption = z.infer<typeof LidarrRootFolderOptionSchema>;

export const LidarrSettingsSchema = z.object({
  url: z.string().nullable(),
  apiKeySet: z.boolean(),
  qualityProfileId: z.number().nullable(),
  metadataProfileId: z.number().nullable(),
  rootFolderPath: z.string().nullable(),
});
export type LidarrSettings = z.infer<typeof LidarrSettingsSchema>;

export const LidarrOptionsSchema = z.object({
  qualityProfiles: z.array(LidarrProfileOptionSchema),
  metadataProfiles: z.array(LidarrProfileOptionSchema),
  rootFolders: z.array(LidarrRootFolderOptionSchema),
});
export type LidarrOptions = z.infer<typeof LidarrOptionsSchema>;

export const LidarrTestResultSchema = z.object({
  connected: z.boolean(),
  options: LidarrOptionsSchema.nullable(),
});
export type LidarrTestResult = z.infer<typeof LidarrTestResultSchema>;

export const DownloadRequestArraySchema = z.array(DownloadRequestSchema);
