import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { playlists } from "./playlists.js";
import { tracks } from "./tracks.js";

export const playlistTracks = sqliteTable("playlist_tracks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => playlists.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  position: integer("position").notNull(),
  addedAt: integer("added_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
