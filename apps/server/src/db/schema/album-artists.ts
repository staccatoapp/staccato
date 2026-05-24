import { createId } from "@paralleldrive/cuid2";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { albums } from "./albums.js";
import { artists } from "./artists.js";

export const albumArtists = sqliteTable(
  "album_artists",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    joinPhrase: text("join_phrase"),
    // Whether this credit "owns" the album (co-artist), as opposed to a feature
    // guest. Derived from the join-phrase chain at write time; drives whether
    // the album shows in this artist's Discography vs. Appears On.
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    uniqueIndex("album_artists_album_id_position_unique").on(
      table.albumId,
      table.position,
    ),
  ],
);
