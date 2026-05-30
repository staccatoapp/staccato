import { z } from "zod";

export const InLibraryDiscographyItemSchema = z.object({
  inLibrary: z.literal(true),
  id: z.string(),
  title: z.string(),
  releaseYear: z.number().nullable(),
  releaseGroupMbid: z.string().nullable(),
  coverArtUrl: z.string().nullable(),
});

const ExternalDiscographyItemSchema = z.object({
  inLibrary: z.literal(false),
  releaseGroupMbid: z.string(),
  title: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
});

export const ArtistDiscographyItemSchema = z.discriminatedUnion("inLibrary", [
  InLibraryDiscographyItemSchema,
  ExternalDiscographyItemSchema,
]);
export type ArtistDiscographyItem = z.infer<typeof ArtistDiscographyItemSchema>;

export const UnifiedArtistLocalSchema = z.object({
  source: z.literal("local"),
  artist: z.object({
    id: z.string(),
    name: z.string(),
    musicbrainzId: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
  albums: z.array(ArtistDiscographyItemSchema),
  appearsOn: z.array(InLibraryDiscographyItemSchema),
});

export const UnifiedArtistExternalSchema = z.object({
  source: z.literal("external"),
  artist: z.object({
    artistMbid: z.string(),
    name: z.string(),
    disambiguation: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
  albums: z.array(ArtistDiscographyItemSchema),
});

export const UnifiedArtistDetailSchema = z.discriminatedUnion("source", [
  UnifiedArtistLocalSchema,
  UnifiedArtistExternalSchema,
]);
export type UnifiedArtistDetail = z.infer<typeof UnifiedArtistDetailSchema>;

// ─── Library list response ──────────────────────────────────
export const ArtistSearchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
});
export type ArtistSearchItem = z.infer<typeof ArtistSearchItemSchema>;

export const ArtistSchema = ArtistSearchItemSchema.extend({
  createdAt: z.string().nullable(),
  albumCount: z.number(),
});
export type Artist = z.infer<typeof ArtistSchema>;
