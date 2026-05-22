import { z } from "zod";

// Façade → server contract for the unified free-text search (R3). The metadata
// service fans out across the recording/artist/release Solr indexes for one
// query and returns all three categories at once. These shapes EXCLUDE
// server-computed fields (`inLibrary`, `coverArtUrl`, artist `imageUrl`) — the
// server layers those on before sending the web-facing ExternalSearchResults.
//
// Named MetadataSearch* (not External*) to avoid a barrel collision with
// api/search.ts, which exports ExternalArtistResult / ExternalReleaseResult.

export const MetadataSearchRecordingSchema = z.object({
  recordingMbid: z.string(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseName: z.string().nullable(),
  releaseMbid: z.string().nullable(),
  // The best release's release-group — lets the server attach cover art to
  // track results (release-group is the Cover Art Archive key).
  releaseGroupMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  durationMs: z.number().nullable(),
});
export type MetadataSearchRecording = z.infer<
  typeof MetadataSearchRecordingSchema
>;

export const MetadataSearchArtistSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  type: z.string().nullable(),
});
export type MetadataSearchArtist = z.infer<typeof MetadataSearchArtistSchema>;

export const MetadataSearchReleaseSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  releaseType: z.string().nullable(),
});
export type MetadataSearchRelease = z.infer<typeof MetadataSearchReleaseSchema>;

export const MetadataSearchResultsSchema = z.object({
  recordings: z.array(MetadataSearchRecordingSchema),
  artists: z.array(MetadataSearchArtistSchema),
  releases: z.array(MetadataSearchReleaseSchema),
});
export type MetadataSearchResults = z.infer<typeof MetadataSearchResultsSchema>;
