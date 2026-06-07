import { createId } from "@paralleldrive/cuid2";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const lastfmEntityTypes = ["track", "album", "artist"] as const;
export type LastfmEntityTypeName = (typeof lastfmEntityTypes)[number];

export const lastfmTags = sqliteTable(
  "lastfm_tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    // "track" | "album" | "artist"
    entityType: text("entity_type", { enum: lastfmEntityTypes }).notNull(),
    // MBID when available, else a normalised `artist|title` name key.
    entityKey: text("entity_key").notNull(),
    // JSON array of { name, weight }.
    tags: text("tags").notNull(),
    // unix epoch ms; pull-through TTL is applied in the cache layer.
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("lastfm_tags_entity_unique").on(
      table.entityType,
      table.entityKey,
    ),
  ],
);

export type LastfmTagsRow = typeof lastfmTags.$inferSelect;
export type NewLastfmTagsRow = typeof lastfmTags.$inferInsert;
