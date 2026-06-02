import { z } from "zod";

export const PlaylistListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  trackCount: z.number(),
  coverArtUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type PlaylistListItem = z.infer<typeof PlaylistListItemSchema>;

export const PlaylistListResponseSchema = z.object({
  items: z.array(PlaylistListItemSchema),
});
export type PlaylistListResponse = z.infer<typeof PlaylistListResponseSchema>;

export const PlaylistTrackSchema = z.object({
  entryId: z.string(),
  trackId: z.string(),
  title: z.string(),
  artistName: z.string().nullable(),
  albumTitle: z.string().nullable(),
  albumId: z.string(),
  coverArtUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  trackNumber: z.number().nullable(),
  position: z.number(),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

export const PlaylistDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string().nullable(),
  tracks: z.array(PlaylistTrackSchema),
});
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;

export const UpdatePlaylistRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
export type UpdatePlaylistRequest = z.infer<typeof UpdatePlaylistRequestSchema>;
