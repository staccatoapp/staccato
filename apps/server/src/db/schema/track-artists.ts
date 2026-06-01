import { createId } from "@paralleldrive/cuid2";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { artists } from "./artists.js";
import { tracks } from "./tracks.js";

export const trackArtists = sqliteTable(
  "track_artists",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    joinPhrase: text("join_phrase"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    uniqueIndex("track_artists_track_id_position_unique").on(
      table.trackId,
      table.position,
    ),
    index("track_artists_artist_id_idx").on(table.artistId),
  ],
);
