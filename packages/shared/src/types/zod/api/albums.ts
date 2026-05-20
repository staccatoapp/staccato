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
    releaseMbid: z.string().nullable(),
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

// ─── Identify Album dialog ──────────────────────────────────
// One row per MusicBrainz *release* (specific pressing), not deduped by
// release-group — the user picks the exact release whose tracklist matches
// what's on disk.
export const IdentifyReleaseCandidateSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
  title: z.string(),
  disambiguation: z.string().nullable(),
  artistName: z.string(),
  formatDetail: z.string().nullable(),
  trackCount: z.number().nullable(),
  country: z.string().nullable(),
  date: z.string().nullable(),
  label: z.string().nullable(),
  releaseType: z.string().nullable(),
});
export type IdentifyReleaseCandidate = z.infer<
  typeof IdentifyReleaseCandidateSchema
>;

export const IdentifySearchResponseSchema = z.object({
  results: z.array(IdentifyReleaseCandidateSchema),
});
export type IdentifySearchResponse = z.infer<
  typeof IdentifySearchResponseSchema
>;

export const IdentifyCandidateTrackSchema = z.object({
  disc: z.number(),
  track: z.number(),
  recordingMbid: z.string(),
  title: z.string(),
  durationSeconds: z.number().nullable(),
});
export type IdentifyCandidateTrack = z.infer<
  typeof IdentifyCandidateTrackSchema
>;

export const IdentifyReleaseTracklistSchema = z.object({
  tracks: z.array(IdentifyCandidateTrackSchema),
});
export type IdentifyReleaseTracklist = z.infer<
  typeof IdentifyReleaseTracklistSchema
>;

export const IdentifyApplyRequestSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
});
export type IdentifyApplyRequest = z.infer<typeof IdentifyApplyRequestSchema>;

export const IdentifyApplyResponseSchema = z.object({
  ok: z.literal(true),
  albumId: z.string(),
  releaseMbid: z.string(),
  title: z.string(),
  remapped: z.number(),
  total: z.number(),
});
export type IdentifyApplyResponse = z.infer<typeof IdentifyApplyResponseSchema>;
