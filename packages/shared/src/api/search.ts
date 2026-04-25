import { z } from "zod";

export const LibrarySearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistName: z.string(),
  albumId: z.string().nullable(),
  albumTitle: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
});
export type LibrarySearchResult = z.infer<typeof LibrarySearchResultSchema>;

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
