import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const downloadRequests = sqliteTable("download_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  musicbrainzReleaseGroupId: text("musicbrainz_release_group_id").notNull(),
  musicbrainzArtistId: text("musicbrainz_artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  albumTitle: text("album_title"),
  lidarrAlbumId: integer("lidarr_album_id"),
  status: text("status", {
    enum: ["requested", "sent_to_lidarr", "downloading", "completed", "failed"],
  }).notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
