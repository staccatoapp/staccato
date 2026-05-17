import { z } from "zod";
import {
  ExternalAlbumDetailSchema,
  ExternalAlbumTrackSchema,
} from "./search.js";

export const UnifiedAlbumLocalTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  recordingMbid: z.string().nullable(),
});
export type UnifiedAlbumLocalTrack = z.infer<typeof UnifiedAlbumLocalTrackSchema>;

export const UnifiedAlbumLocalSchema = z.object({
  source: z.literal("local"),
  album: z.object({
    id: z.string(),
    title: z.string(),
    artistId: z.string(),
    artistName: z.string(),
    releaseYear: z.number().nullable(),
    releaseGroupMbid: z.string().nullable(),
    coverArtUrl: z.string().nullable(),
  }),
  tracks: z.array(UnifiedAlbumLocalTrackSchema),
});

export const UnifiedAlbumExternalSchema = z.object({
  source: z.literal("external"),
  album: ExternalAlbumDetailSchema.omit({ tracks: true }).extend({
    coverArtUrl: z.string().nullable(),
  }),
  tracks: z.array(ExternalAlbumTrackSchema),
});

export const UnifiedAlbumDetailSchema = z.discriminatedUnion("source", [
  UnifiedAlbumLocalSchema,
  UnifiedAlbumExternalSchema,
]);
export type UnifiedAlbumDetail = z.infer<typeof UnifiedAlbumDetailSchema>;
