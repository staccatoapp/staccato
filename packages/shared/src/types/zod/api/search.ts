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
});
export type ExternalRecording = z.infer<typeof ExternalRecordingSchema>;

export const ExternalArtistResultSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  type: z.string().nullable(),
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
});
export type ExternalReleaseResult = z.infer<typeof ExternalReleaseResultSchema>;

export const ExternalSearchResultsSchema = z.object({
  recordings: z.array(ExternalRecordingSchema),
  artists: z.array(ExternalArtistResultSchema),
  releases: z.array(ExternalReleaseResultSchema),
});
export type ExternalSearchResults = z.infer<typeof ExternalSearchResultsSchema>;

export type ExternalSearchType = "recording" | "release" | "artist";

export const ExternalAlbumTrackSchema = z.object({
  discPosition: z.number(),
  trackPosition: z.number(),
  recordingMbid: z.string(),
  title: z.string(),
  durationMs: z.number().nullable(),
});
export type ExternalAlbumTrack = z.infer<typeof ExternalAlbumTrackSchema>;

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
export type ExternalAlbumDetail = z.infer<typeof ExternalAlbumDetailSchema>;
