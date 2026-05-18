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

export const recommendationCacheStatuses = [
  "warming",
  "ready",
  "error",
] as const;
export type RecommendationCacheStatus =
  (typeof recommendationCacheStatuses)[number];

export const recommendationCache = sqliteTable(
  "recommendation_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
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
    userSourceKindUnique: uniqueIndex("recommendation_cache_user_source_kind")
      .on(table.userId, table.source, table.kind),
    dueIdx: index("idx_recommendation_cache_due")
      .on(table.nextRefreshAt)
      .where(sql`${table.inflight} = 0`),
  }),
);

export type RecommendationCacheRow = typeof recommendationCache.$inferSelect;
export type NewRecommendationCacheRow =
  typeof recommendationCache.$inferInsert;
