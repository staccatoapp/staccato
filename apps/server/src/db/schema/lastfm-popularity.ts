import { createId } from "@paralleldrive/cuid2";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { lastfmEntityTypes } from "./lastfm-tags.js";

export const lastfmPopularity = sqliteTable(
  "lastfm_popularity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    entityType: text("entity_type", { enum: lastfmEntityTypes }).notNull(),
    entityKey: text("entity_key").notNull(),
    listeners: integer("listeners").notNull(),
    playcount: integer("playcount").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("lastfm_popularity_entity_unique").on(
      table.entityType,
      table.entityKey,
    ),
  ],
);

export type LastfmPopularityRow = typeof lastfmPopularity.$inferSelect;
export type NewLastfmPopularityRow = typeof lastfmPopularity.$inferInsert;
