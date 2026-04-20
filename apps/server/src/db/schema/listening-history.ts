import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tracks } from "./tracks.js";
import { users } from "./users.js";

export const listeningHistory = sqliteTable("listening_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  listenedAt: integer("listened_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  scrobbledToListenbrainz: integer("scrobbled_to_listenbrainz", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
});
