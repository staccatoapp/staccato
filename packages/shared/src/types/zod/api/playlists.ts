import { z } from "zod";
import { paginatedSchema } from "../../../pagination.js";

export const PlaylistListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  trackCount: z.number(),
  /** Up to 4 dominant cover arts (most-shared first) for a mosaic thumbnail. */
  coverArtUrls: z.array(z.string()).max(4),
  updatedAt: z.string().nullable(),
});
export type PlaylistListItem = z.infer<typeof PlaylistListItemSchema>;

export const PlaylistListResponseSchema = paginatedSchema(
  PlaylistListItemSchema,
);
export type PlaylistListResponse = z.infer<typeof PlaylistListResponseSchema>;

/** Sort keys for the paged playlists list. `createdAt` = most-recently-added first. */
export const PlaylistSortSchema = z.enum(["createdAt", "title"]);
export type PlaylistSort = z.infer<typeof PlaylistSortSchema>;

export const PlaylistTrackSchema = z.object({
  entryId: z.string(),
  trackId: z.string(),
  /** MusicBrainz recording id of the owned track, when known. */
  recordingMbid: z.string().nullable(),
  title: z.string(),
  artistName: z.string().nullable(),
  albumTitle: z.string().nullable(),
  albumId: z.string(),
  coverArtUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  trackNumber: z.number().nullable(),
  /** Source file extension (e.g. "mp3", "m4a") — the local download extension. */
  fileExtension: z.string().nullable(),
  position: z.number(),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

export const PlaylistDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string().nullable(),
  /** Up to 4 dominant cover arts (most-shared first) for a mosaic hero/thumb. */
  coverArtUrls: z.array(z.string()).max(4),
  tracks: z.array(PlaylistTrackSchema),
});
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;

export const UpdatePlaylistRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
export type UpdatePlaylistRequest = z.infer<typeof UpdatePlaylistRequestSchema>;
