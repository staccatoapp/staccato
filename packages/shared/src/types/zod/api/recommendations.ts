import { z } from "zod";

export const RecommendedTrackSchema = z.object({
  recordingMbid: z.string(),
  title: z.string(),
  artistName: z.string().nullable(),
  artistMbid: z.string().nullable(),
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
  artistMbid: z.string().nullable(),
  albumTitle: z.string().nullable(),
  releaseGroupMbid: z.string().nullable(),
  durationMs: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  inLibrary: z.boolean(),
  localTrackId: z.string().nullable(),
});

export const PlaylistSourceSchema = z.enum(["staccato", "listenbrainz"]);
export type PlaylistSource = z.infer<typeof PlaylistSourceSchema>;

export const RecommendedPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  trackCount: z.number(),
  tracks: z.array(RecommendedPlaylistTrackSchema),
  coverArtUrl: z.string().nullable(),
  expiresAt: z.string().nullable(),
  source: PlaylistSourceSchema,
});

export const RecommendationErrorSchema = z.object({
  error: z.enum(["no-id", "no-listens"]),
});

export type RecommendedTrack = z.infer<typeof RecommendedTrackSchema>;
export type RecommendedPlaylistTrack = z.infer<
  typeof RecommendedPlaylistTrackSchema
>;
export type RecommendedPlaylist = z.infer<typeof RecommendedPlaylistSchema>;
export type RecommendationError = z.infer<typeof RecommendationErrorSchema>;

export type RecommendationsResponse<T> =
  | { status: "no-token" }
  | { status: "warming" }
  | { status: "ready"; data: T }
  | { status: "error"; data: T | null };

export type RecommendedTracksResponse = RecommendationsResponse<
  RecommendedTrack[]
>;
export type RecommendedPlaylistsResponse = RecommendationsResponse<
  RecommendedPlaylist[]
>;

export const recommendationsResponseSchema = <T>(dataSchema: z.ZodType<T>) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("no-token") }),
    z.object({ status: z.literal("warming") }),
    z.object({ status: z.literal("ready"), data: dataSchema }),
    z.object({ status: z.literal("error"), data: dataSchema.nullable() }),
  ]);

export const RecommendedTracksResponseSchema = recommendationsResponseSchema(
  z.array(RecommendedTrackSchema),
);
export const RecommendedPlaylistsResponseSchema = recommendationsResponseSchema(
  z.array(RecommendedPlaylistSchema),
);

// SP3 playlist track-suggestions reuse the playlist-track shape (preview by
// recordingMbid needs no payload field; localTrackId/inLibrary drive add/play).
export type PlaylistSuggestionsResponse = RecommendationsResponse<
  RecommendedPlaylistTrack[]
>;
export const PlaylistSuggestionsResponseSchema = recommendationsResponseSchema(
  z.array(RecommendedPlaylistTrackSchema),
);
