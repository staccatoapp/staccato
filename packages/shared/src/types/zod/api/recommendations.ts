import { z } from "zod";

export const RecommendedTrackSchema = z.object({
  recordingMbid: z.string(),
  title: z.string(),
  artistName: z.string().nullable(),
  albumTitle: z.string().nullable(),
  releaseGroupMbid: z.string().nullable(),
  coverArtUrl: z.string().nullable(),
  previewUrl: z.string().nullable(),
  durationMs: z.number().nullable(),
  inLibrary: z.boolean(),
});

export const RecommendedPlaylistTrackSchema = z.object({
  recordingMbid: z.string().nullable(),
  title: z.string(),
  artistName: z.string().nullable(),
  albumTitle: z.string().nullable(),
  durationMs: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  inLibrary: z.boolean(),
});

export const RecommendedPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  trackCount: z.number(),
  tracks: z.array(RecommendedPlaylistTrackSchema),
  coverArtUrl: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export const RecommendationErrorSchema = z.object({
  error: z.enum(["no-id", "no-listens"]),
});

export const RecommendationPlaylistsResponseSchema = z.union([
  RecommendationErrorSchema,
  z.object({
    data: z.array(RecommendedPlaylistSchema),
    expiresAt: z.string().nullable(),
  }),
]);

export const RecommendationTracksResponseSchema = z.union([
  RecommendationErrorSchema,
  z.object({
    data: z.array(RecommendedTrackSchema),
    expiresAt: z.string().nullable(),
  }),
]);

export type RecommendedTrack = z.infer<typeof RecommendedTrackSchema>;
export type RecommendedPlaylistTrack = z.infer<
  typeof RecommendedPlaylistTrackSchema
>;
export type RecommendedPlaylist = z.infer<typeof RecommendedPlaylistSchema>;
export type RecommendationError = z.infer<typeof RecommendationErrorSchema>;
export type RecommendationPlaylistsResponse = z.infer<
  typeof RecommendationPlaylistsResponseSchema
>;
export type RecommendationTracksResponse = z.infer<
  typeof RecommendationTracksResponseSchema
>;
