import { z } from "zod";
import { MetadataReleaseTrackSchema } from "./release.js";
import { MetadataArtistCreditSchema } from "./recording.js";

// Façade → server contract for an album (release-group) detail lookup (R6).
// Mirrors the server's ExternalAlbumDetail. The façade collapses the two MB
// calls (release-group lookup → pickBestRelease → release lookup) into one
// round-trip; the chosen release's tracklist comes back as MetadataReleaseTrack[].

export const MetadataAlbumDetailSchema = z.object({
  releaseGroupMbid: z.string(),
  releaseMbid: z.string(),
  title: z.string(),
  artistName: z.string(),
  artistMbid: z.string().nullable(),
  releaseYear: z.number().nullable(),
  releaseType: z.string().nullable(),
  artistCredits: z.array(MetadataArtistCreditSchema),
  tracks: z.array(MetadataReleaseTrackSchema),
});
export type MetadataAlbumDetail = z.infer<typeof MetadataAlbumDetailSchema>;
