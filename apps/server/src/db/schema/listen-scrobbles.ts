import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { listeningHistory } from "./listening-history.js";

// Per-target delivery status for a recorded listen. One row per
// (listenId, target): the listening_history row is the unconditional local
// ledger, while each registered scrobble target gets its own delivery record.
export const listenScrobbles = sqliteTable(
  "listen_scrobbles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    listenId: text("listen_id")
      .notNull()
      .references(() => listeningHistory.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    status: text("status", {
      enum: ["pending", "delivered", "failed"],
    }).notNull(),
    lastError: text("last_error"),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    listenTarget: uniqueIndex("listen_scrobbles_listen_target").on(
      t.listenId,
      t.target,
    ),
  }),
);
