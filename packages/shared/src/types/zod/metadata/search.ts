import { z } from "zod";

// Façade → server contract for the unified free-text search (R3). The metadata
// service fans out across the recording/artist/release Solr indexes for one
// query and returns all three categories at once. These shapes EXCLUDE
// server-computed fields (`inLibrary`, `coverArtUrl`, artist `imageUrl`) — the
// server layers those on before sending the web-facing ExternalSearchResults.
//
// Named MetadataSearch* (not External*) to avoid a barrel collision with
// api/search.ts, which exports ExternalArtistResult / ExternalReleaseResult.

// Per-item ListenBrainz popularity (total global listen count), used by the
// façade for ranking and surfaced for optional display. Null when LB has no
// data for the MBID or the popularity lookup was unavailable.
const listenCount = z.number().nullable();

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
  listenCount,
});
export type MetadataSearchRecording = z.infer<
  typeof MetadataSearchRecordingSchema
>;

export const MetadataSearchArtistSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  type: z.string().nullable(),
  listenCount,
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
  listenCount,
});
export type MetadataSearchRelease = z.infer<typeof MetadataSearchReleaseSchema>;

// Cross-category best match. A pointer into the sections (the top entity is
// always present in its section list), so it carries no duplicated data and
// inherits the server's enrichment.
export const MetadataSearchTopResultSchema = z.object({
  type: z.enum(["recording", "artist", "release"]),
  mbid: z.string(),
});
export type MetadataSearchTopResult = z.infer<
  typeof MetadataSearchTopResultSchema
>;

export const MetadataSearchResultsSchema = z.object({
  recordings: z.array(MetadataSearchRecordingSchema),
  artists: z.array(MetadataSearchArtistSchema),
  releases: z.array(MetadataSearchReleaseSchema),
  topResult: MetadataSearchTopResultSchema.nullable(),
});
export type MetadataSearchResults = z.infer<typeof MetadataSearchResultsSchema>;
