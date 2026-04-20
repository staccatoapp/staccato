import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const downloadRequests = sqliteTable("download_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  musicbrainzRecordingId: text("musicbrainz_recording_id").notNull(),
  musicbrainzReleaseId: text("musicbrainz_release_id"),
  artistName: text("artist_name").notNull(),
  trackTitle: text("track_title").notNull(),
  albumTitle: text("album_title"),
  status: text("status", {
    enum: ["requested", "sent_to_lidarr", "downloading", "completed", "failed"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
