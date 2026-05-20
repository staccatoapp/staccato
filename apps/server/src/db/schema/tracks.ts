import { createId } from "@paralleldrive/cuid2";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { albums } from "./albums.js";
import { artists } from "./artists.js";

export const resolutionStatus = [
  "pending",
  "resolving",
  "resolved",
  "failed",
] as const;
export type ResolutionStatus = (typeof resolutionStatus)[number];

// Legacy column. Kept for backwards-compatibility with existing DBs; unused by
// the new per-track pipeline. Safe to drop in a follow-up migration once the
// rollout is verified.
export const legacyFingerprintStatus = [
  "pending",
  "processing",
  "matched",
  "failed",
] as const;
export type LegacyFingerprintStatus =
  (typeof legacyFingerprintStatus)[number];

export const resolutionMethod = [
  "tag_mbid",
  "acoustid",
  "search",
  "manual",
] as const;
export type ResolutionMethod = (typeof resolutionMethod)[number];

export const tracks = sqliteTable("tracks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  canonicalTitle: text("canonical_title"),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  albumId: text("album_id").references(() => albums.id, {
    onDelete: "set null",
  }),
  musicbrainzId: text("musicbrainz_id"),
  trackNumber: integer("track_number"),
  discNumber: integer("disc_number"),
  durationSeconds: integer("duration_seconds"),
  filePath: text("file_path").notNull().unique(),
  fileFormat: text("file_format"),
  fileSizeBytes: integer("file_size_bytes"),
  fileMtime: integer("file_mtime"),
  audioFingerprint: text("audio_fingerprint"),
  fingerprintStatus: text("fingerprint_status", {
    enum: legacyFingerprintStatus,
  })
    .notNull()
    .default("pending"),
  resolutionStatus: text("resolution_status", {
    enum: resolutionStatus,
  })
    .notNull()
    .default("pending"),
  resolutionMethod: text("resolution_method", {
    enum: resolutionMethod,
  }),
  confidenceScore: real("confidence_score"),
  pendingRemovalAt: integer("pending_removal_at"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
