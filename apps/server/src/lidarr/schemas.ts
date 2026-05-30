import { z } from "zod";

export const LidarrProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type LidarrProfile = z.infer<typeof LidarrProfileSchema>;

export const LidarrRootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
});
export type LidarrRootFolder = z.infer<typeof LidarrRootFolderSchema>;

export const LidarrArtistSchema = z.object({
  id: z.number(),
  artistName: z.string(),
  foreignArtistId: z.string(),
  monitored: z.boolean(),
});
export type LidarrArtist = z.infer<typeof LidarrArtistSchema>;

export const LidarrAlbumStatisticsSchema = z.object({
  trackCount: z.number(),
  trackFileCount: z.number(),
  percentOfTracks: z.number(),
  sizeOnDisk: z.number(),
});
export type LidarrAlbumStatistics = z.infer<typeof LidarrAlbumStatisticsSchema>;

export const LidarrAlbumSchema = z.object({
  id: z.number(),
  title: z.string(),
  foreignAlbumId: z.string(),
  artistId: z.number(),
  monitored: z.boolean(),
  statistics: LidarrAlbumStatisticsSchema.optional(),
});
export type LidarrAlbum = z.infer<typeof LidarrAlbumSchema>;

export const LidarrQueueItemSchema = z.object({
  id: z.number(),
  albumId: z.number(),
  title: z.string(),
  status: z.string(),
});
export type LidarrQueueItem = z.infer<typeof LidarrQueueItemSchema>;

export const LidarrQueueResponseSchema = z.object({
  records: z.array(LidarrQueueItemSchema),
});
