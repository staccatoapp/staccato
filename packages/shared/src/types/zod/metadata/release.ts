import { z } from "zod";

// Façade → server contract for a release lookup (R4). Mirrors the server's
// MBReleaseDetails / MBReleaseTrack. The façade owns the media.flatMap
// tracklist reshaping (and drops video recordings); the server consumes the
// flattened tracks directly (Identify dialog tracklist + apply remap).

export const MetadataReleaseTrackSchema = z.object({
  discPosition: z.number(),
  trackPosition: z.number(),
  recordingMbid: z.string(),
  title: z.string(),
  durationMs: z.number().nullable(),
});
export type MetadataReleaseTrack = z.infer<typeof MetadataReleaseTrackSchema>;

export const MetadataReleaseDetailSchema = z.object({
  releaseName: z.string().nullable(),
  disambiguation: z.string().nullable(),
  releaseYear: z.number().nullable(),
  artistMbid: z.string().nullable(),
  artistName: z.string().nullable(),
  releaseGroupMbid: z.string().nullable(),
  tracks: z.array(MetadataReleaseTrackSchema),
});
export type MetadataReleaseDetail = z.infer<typeof MetadataReleaseDetailSchema>;
