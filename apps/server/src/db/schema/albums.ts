import { createId } from "@paralleldrive/cuid2";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { artists } from "./artists.js";

export const albums = sqliteTable(
  "albums",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title"),
    canonicalTitle: text("canonical_title"),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    releaseMbid: text("release_mbid"),
    releaseGroupMbid: text("release_group_mbid"),
    coverArtUrl: text("cover_art_url"),
    releaseYear: integer("release_year"),
    confidenceScore: real("confidence_score"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    uniqueIndex("albums_title_artist_id_release_mbid_unique").on(
      table.title,
      table.artistId,
      table.releaseMbid,
    ),
  ],
);
