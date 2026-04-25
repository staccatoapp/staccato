import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { albums } from "./albums.js";
import { artists } from "./artists.js";

export const tracks = sqliteTable("tracks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  canonicalTitle: text("canonical_title"),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  albumId: text("album_id").references(() => albums.id),
  musicbrainzId: text("musicbrainz_id"),
  trackNumber: integer("track_number"),
  discNumber: integer("disc_number"),
  durationSeconds: integer("duration_seconds"),
  filePath: text("file_path").notNull().unique(),
  fileFormat: text("file_format"),
  fileSizeBytes: integer("file_size_bytes"),
  fingerprintStatus: text("fingerprint_status", {
    enum: ["pending", "processing", "matched", "failed"],
  })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
