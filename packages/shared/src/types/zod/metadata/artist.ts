import { z } from "zod";

// Façade → server contract for an artist detail + discography lookup (R7).
// Mirrors the server's ExternalArtistDetail + ArtistReleaseGroup. The façade
// combines the artist lookup with the paginated release-group fetch into one
// round-trip and returns both halves; consumers use whichever they need (the
// local-with-MBID branch reads only releaseGroups).

export const MetadataArtistSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
});
export type MetadataArtist = z.infer<typeof MetadataArtistSchema>;

export const MetadataArtistReleaseGroupSchema = z.object({
  releaseGroupMbid: z.string(),
  title: z.string(),
  firstReleaseDate: z.string().nullable(),
  primaryType: z.string().nullable(),
  secondaryTypes: z.array(z.string()),
});
export type MetadataArtistReleaseGroup = z.infer<
  typeof MetadataArtistReleaseGroupSchema
>;

export const MetadataArtistDetailSchema = z.object({
  artist: MetadataArtistSchema,
  releaseGroups: z.array(MetadataArtistReleaseGroupSchema),
});
export type MetadataArtistDetail = z.infer<typeof MetadataArtistDetailSchema>;
