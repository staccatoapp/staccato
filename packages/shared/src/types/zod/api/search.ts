import { z } from "zod";

export const ExternalRecordingSchema = z.object({
  recordingMbid: z.string(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseName: z.string().nullable(),
  releaseMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  durationMs: z.number().nullable(),
  inLibrary: z.boolean(),
  coverArtUrl: z.string().nullable(),
  // Global ListenBrainz listen count — drives ranking and optional display.
  listenCount: z.number().nullable(),
});
export type ExternalRecording = z.infer<typeof ExternalRecordingSchema>;

export const ExternalArtistResultSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  type: z.string().nullable(),
  listenCount: z.number().nullable(),
  // Server-attached local artist image URL (see attachArtistImagesByMbid).
  imageUrl: z.string().nullable(),
});
export type ExternalArtistResult = z.infer<typeof ExternalArtistResultSchema>;

export const ExternalReleaseResultSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  releaseType: z.string().nullable(),
  coverArtUrl: z.string().nullable(),
  listenCount: z.number().nullable(),
});
export type ExternalReleaseResult = z.infer<typeof ExternalReleaseResultSchema>;

// Cross-category best match — a pointer into the sections above. The web
// resolves it against the matching result array to render the "Top result" card.
export const ExternalSearchTopResultSchema = z.object({
  type: z.enum(["recording", "artist", "release"]),
  mbid: z.string(),
});
export type ExternalSearchTopResult = z.infer<
  typeof ExternalSearchTopResultSchema
>;

export const ExternalSearchResultsSchema = z.object({
  recordings: z.array(ExternalRecordingSchema),
  artists: z.array(ExternalArtistResultSchema),
  releases: z.array(ExternalReleaseResultSchema),
  topResult: ExternalSearchTopResultSchema.nullable(),
});
export type ExternalSearchResults = z.infer<typeof ExternalSearchResultsSchema>;

export const ExternalAlbumTrackSchema = z.object({
  discPosition: z.number(),
  trackPosition: z.number(),
  recordingMbid: z.string(),
  title: z.string(),
  durationMs: z.number().nullable(),
});

export const ExternalAlbumDetailSchema = z.object({
  releaseGroupMbid: z.string(),
  releaseMbid: z.string(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  releaseType: z.string().nullable(),
  tracks: z.array(ExternalAlbumTrackSchema),
});
