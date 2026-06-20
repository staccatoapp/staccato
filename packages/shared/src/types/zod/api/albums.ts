import { z } from "zod";
import { paginatedSchema } from "../../../pagination.js";
import {
  ExternalAlbumDetailSchema,
  ExternalAlbumTrackSchema,
} from "./search.js";
import { AlbumArtistCreditSchema, TrackArtistCreditSchema } from "./credits.js";

export const UnifiedAlbumLocalTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  recordingMbid: z.string().nullable(),
  /** Source file extension (e.g. "mp3", "m4a") — the local download extension. */
  fileExtension: z.string().nullable(),
  artists: z.array(TrackArtistCreditSchema),
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
    confidenceScore: z.number().nullable(),
    pendingTrackCount: z.number(),
    artists: z.array(AlbumArtistCreditSchema),
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

// Local tracks stranded in a *different* album row but living in the same
// folder on disk as the album being identified — candidates to pull in (adopt)
// when a mistagged file fractured one folder into multiple album rows.
export const IdentifyOrphanTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  sourceAlbumId: z.string(),
  sourceAlbumTitle: z.string().nullable(),
  artistName: z.string(),
});
export type IdentifyOrphanTrack = z.infer<typeof IdentifyOrphanTrackSchema>;

export const IdentifyOrphansResponseSchema = z.object({
  orphans: z.array(IdentifyOrphanTrackSchema),
});
export type IdentifyOrphansResponse = z.infer<
  typeof IdentifyOrphansResponseSchema
>;

export const IdentifyApplyRequestSchema = z.object({
  releaseMbid: z.string(),
  releaseGroupMbid: z.string().nullable(),
  // Track ids from other album rows to pull into this album before remapping.
  adoptTrackIds: z.array(z.string()).optional().default([]),
});
export type IdentifyApplyRequest = z.infer<typeof IdentifyApplyRequestSchema>;

export const IdentifyApplyResponseSchema = z.object({
  ok: z.literal(true),
  albumId: z.string(),
  releaseMbid: z.string(),
  title: z.string(),
  remapped: z.number(),
  adopted: z.number(),
  total: z.number(),
});
export type IdentifyApplyResponse = z.infer<typeof IdentifyApplyResponseSchema>;

export const ConfirmMatchResponseSchema = z.object({
  ok: z.literal(true),
  albumId: z.string(),
  confirmed: z.number(),
});
export type ConfirmMatchResponse = z.infer<typeof ConfirmMatchResponseSchema>;

// ─── Edit Album dialog ──────────────────────────────────────
// The save payload for manual album edits. The dialog sends the *full*
// post-edit album + ordered track list; the (future) server handler diffs it
// against the album's current tracks to derive removals, and treats any trackId
// not currently on this album as an attach-from-library. Edits write directly
// to the canonical rows ("overwrite" model) — there is no per-field lock, so a
// later file re-tag / retry-resolution / sibling re-resolve can overwrite them.
//
// Credits carry name + joinPhrase only (no artistId): manual edits are free
// text, so the server resolves or creates artist rows by name when persistence
// lands. joinPhrase follows MusicBrainz semantics — the connector placed *after*
// this credit (e.g. " feat. ", " & "); the last credit's joinPhrase is unused.
export const AlbumEditCreditSchema = z.object({
  name: z.string(),
  joinPhrase: z.string().nullable(),
  position: z.number(),
});
export type AlbumEditCredit = z.infer<typeof AlbumEditCreditSchema>;

export const AlbumEditTrackSchema = z.object({
  trackId: z.string(),
  title: z.string(),
  trackNumber: z.number(),
  discNumber: z.number(),
  artists: z.array(AlbumEditCreditSchema),
});
export type AlbumEditTrack = z.infer<typeof AlbumEditTrackSchema>;

export const AlbumEditRequestSchema = z.object({
  title: z.string(),
  artistName: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  tracks: z.array(AlbumEditTrackSchema),
});
export type AlbumEditRequest = z.infer<typeof AlbumEditRequestSchema>;

export const AlbumEditResponseSchema = z.object({
  ok: z.literal(true),
  albumId: z.string(),
  updatedTracks: z.number(),
  removedTracks: z.number(),
  attachedTracks: z.number(),
});
export type AlbumEditResponse = z.infer<typeof AlbumEditResponseSchema>;

// ─── Library list response ──────────────────────────────────
export const AlbumListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistId: z.string(),
  artistName: z.string(),
  artists: z.array(AlbumArtistCreditSchema),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
  confidenceScore: z.number().nullable(),
  pendingTrackCount: z.number(),
});
export type AlbumListItem = z.infer<typeof AlbumListItemSchema>;

/** Sort keys for the paged albums list. `createdAt` = most-recently-added first. */
export const AlbumSortSchema = z.enum(["createdAt", "title", "artist", "year"]);
export type AlbumSort = z.infer<typeof AlbumSortSchema>;

export const AlbumListResponseSchema = paginatedSchema(AlbumListItemSchema);
export type AlbumListResponse = z.infer<typeof AlbumListResponseSchema>;
