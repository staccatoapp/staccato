import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tracks } from "./tracks.js";
import { users } from "./users.js";
import { sql } from "drizzle-orm";

export const listeningHistory = sqliteTable(
  "listening_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    listenedAt: integer("listened_at")
      .notNull()
      .default(sql`(unixepoch())`),
    scrobbledToListenbrainz: integer("scrobbled_to_listenbrainz", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    // Where this play was started from (album or in-library playlist),
    // denormalised from the playback session at record time so recently-played
    // can aggregate plays by their origin. Null for contextless plays.
    sourceType: text("source_type"),
    sourceId: text("source_id"),
  },
  (table) => [
    index("listening_history_user_id_idx").on(table.userId),
    index("listening_history_track_id_idx").on(table.trackId),
    // Backs the recently-played query (most-recent listen per source for a user).
    index("listening_history_user_listened_at_idx").on(
      table.userId,
      table.listenedAt,
    ),
  ],
);
