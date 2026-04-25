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
  tracks: z.array(PlaylistTrackSchema),
  updatedAt: z.string().nullable(),
});
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;
