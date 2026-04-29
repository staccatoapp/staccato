import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tracks } from "./tracks.js";

export const trackLyrics = sqliteTable("track_lyrics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  trackId: text("track_id")
    .notNull()
    .unique()
    .references(() => tracks.id),
  instrumental: integer("instrumental", { mode: "boolean" }).notNull(),
  plainLyrics: text("plain_lyrics"),
  syncedLyrics: text("synced_lyrics"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export type TrackLyricsRow = typeof trackLyrics.$inferSelect;
export type NewTrackLyricsRow = typeof trackLyrics.$inferInsert;
