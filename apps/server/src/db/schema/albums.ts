import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { artists } from "./artists.js";

export const albums = sqliteTable("albums", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  musicbrainzId: text("musicbrainz_id"),
  coverArtUrl: text("cover_art_url"),
  releaseYear: integer("release_year"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
