import { createId } from "@paralleldrive/cuid2";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { playlists } from "./playlists.js";
import { tracks } from "./tracks.js";

export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: integer("added_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    index("playlist_tracks_playlist_id_idx").on(table.playlistId),
    index("playlist_tracks_track_id_idx").on(table.trackId),
    uniqueIndex("playlist_tracks_playlist_id_position_unique").on(
      table.playlistId,
      table.position,
    ),
  ],
);
