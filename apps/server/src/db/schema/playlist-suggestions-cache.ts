import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./users.js";
import { playlists } from "./playlists.js";
import { recommendationCacheStatuses } from "./recommendation-cache.js";

// Per-(user, playlist) suggestion cache. Mirrors recommendation_cache's columns
// and lifecycle (warming/ready/error, inflight claim, nextRefreshAt due-scan) but
// is keyed per playlist — a shape the per-(user,source,kind) recommendation_cache
// cannot express (SP3 design G1). Cascade-deletes with both the user and the
// playlist.
export const playlistSuggestionsCache = sqliteTable(
  "playlist_suggestions_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    status: text("status", { enum: recommendationCacheStatuses }).notNull(),
    inflight: integer("inflight").notNull().default(0),
    payload: text("payload"),
    lastError: text("last_error"),
    fetchedAt: integer("fetched_at"),
    nextRefreshAt: integer("next_refresh_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userPlaylistUnique: uniqueIndex(
      "playlist_suggestions_cache_user_playlist",
    ).on(table.userId, table.playlistId),
    dueIdx: index("idx_playlist_suggestions_cache_due")
      .on(table.nextRefreshAt)
      .where(sql`${table.inflight} = 0`),
  }),
);

export type PlaylistSuggestionsCacheRow =
  typeof playlistSuggestionsCache.$inferSelect;
export type NewPlaylistSuggestionsCacheRow =
  typeof playlistSuggestionsCache.$inferInsert;
