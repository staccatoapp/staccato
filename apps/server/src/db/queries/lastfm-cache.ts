import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  lastfmPopularity,
  type LastfmPopularityRow,
} from "../schema/lastfm-popularity.js";
import {
  lastfmTags,
  type LastfmEntityTypeName,
  type LastfmTagsRow,
} from "../schema/lastfm-tags.js";
import type { LastfmTag } from "../../lastfm/types.js";

export function getCachedTags(
  entityType: LastfmEntityTypeName,
  entityKey: string,
): LastfmTagsRow | undefined {
  return db
    .select()
    .from(lastfmTags)
    .where(
      and(
        eq(lastfmTags.entityType, entityType),
        eq(lastfmTags.entityKey, entityKey),
      ),
    )
    .get();
}

export function upsertCachedTags(
  entityType: LastfmEntityTypeName,
  entityKey: string,
  tags: LastfmTag[],
  fetchedAt: number,
): void {
  db.insert(lastfmTags)
    .values({ entityType, entityKey, tags: JSON.stringify(tags), fetchedAt })
    .onConflictDoUpdate({
      target: [lastfmTags.entityType, lastfmTags.entityKey],
      set: { tags: JSON.stringify(tags), fetchedAt },
    })
    .run();
}

export function getCachedPopularity(
  entityType: LastfmEntityTypeName,
  entityKey: string,
): LastfmPopularityRow | undefined {
  return db
    .select()
    .from(lastfmPopularity)
    .where(
      and(
        eq(lastfmPopularity.entityType, entityType),
        eq(lastfmPopularity.entityKey, entityKey),
      ),
    )
    .get();
}

export function upsertCachedPopularity(
  entityType: LastfmEntityTypeName,
  entityKey: string,
  listeners: number,
  playcount: number,
  fetchedAt: number,
): void {
  db.insert(lastfmPopularity)
    .values({ entityType, entityKey, listeners, playcount, fetchedAt })
    .onConflictDoUpdate({
      target: [lastfmPopularity.entityType, lastfmPopularity.entityKey],
      set: { listeners, playcount, fetchedAt },
    })
    .run();
}
