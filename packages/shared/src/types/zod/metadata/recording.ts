import { z } from "zod";

// Façade → server contract for a recording lookup. Mirrors the resolver's rich
// recording shape (apps/server library RecordingCandidate/ReleaseCandidate/
// ArtistCredit) MINUS server-only resolution fields (`method`, `acoustidScore`)
// and web-only computed fields (`inLibrary`, `coverArtUrl`). The metadata
// service returns this; the server maps it onto its internal/domain types.

export const MetadataArtistCreditSchema = z.object({
  mbid: z.string(),
  name: z.string(),
  joinPhrase: z.string().nullable(),
});
export type MetadataArtistCredit = z.infer<typeof MetadataArtistCreditSchema>;

export const MetadataReleaseSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
  title: z.string(),
  date: z.string().nullable(),
  country: z.string().nullable(),
  status: z.string().nullable(),
  primaryType: z.string().nullable(),
  secondaryTypes: z.array(z.string()),
  mediaFormats: z.array(z.string()),
});
export type MetadataRelease = z.infer<typeof MetadataReleaseSchema>;

export const MetadataRecordingSchema = z.object({
  recordingMbid: z.string(),
  title: z.string(),
  durationMs: z.number().nullable(),
  // MB's video flag. The resolver drops video recordings (a music video shares
  // artist+title with the audio recording); recommendation lookups ignore it.
  video: z.boolean(),
  artistCredits: z.array(MetadataArtistCreditSchema),
  releases: z.array(MetadataReleaseSchema),
});
export type MetadataRecording = z.infer<typeof MetadataRecordingSchema>;

// R2 · resolver structured search. The R1 recording shape plus the Solr
// relevance score; the resolver ranks candidates and applies thresholds on it.
export const MetadataRecordingSearchResultSchema = MetadataRecordingSchema.extend(
  {
    score: z.number(),
  },
);
export type MetadataRecordingSearchResult = z.infer<
  typeof MetadataRecordingSearchResultSchema
>;

export const MetadataRecordingSearchResponseSchema = z.object({
  recordings: z.array(MetadataRecordingSearchResultSchema),
});
export type MetadataRecordingSearchResponse = z.infer<
  typeof MetadataRecordingSearchResponseSchema
>;
