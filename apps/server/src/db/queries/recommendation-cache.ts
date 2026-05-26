import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../client.js";
import {
  recommendationCache,
  type RecommendationCacheRow,
} from "../schema/recommendation-cache.js";
import { userSettings } from "../schema/user-settings.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "recommendations-cache" });
export { log as recommendationsCacheLog };

export function findDueRowIds(now: number): string[] {
  const rows = db
    .select({ id: recommendationCache.id })
    .from(recommendationCache)
    .where(
      and(
        lte(recommendationCache.nextRefreshAt, now),
        eq(recommendationCache.inflight, 0),
      ),
    )
    .all();
  return rows.map((r) => r.id);
}

export function findRowsForUserKind(
  userId: string,
  kind: string,
): RecommendationCacheRow[] {
  return db
    .select()
    .from(recommendationCache)
    .where(
      and(
        eq(recommendationCache.userId, userId),
        eq(recommendationCache.kind, kind),
      ),
    )
    .all();
}

export function findRowById(id: string): RecommendationCacheRow | undefined {
  return db
    .select()
    .from(recommendationCache)
    .where(eq(recommendationCache.id, id))
    .get();
}

export function upsertWarmingRow(
  userId: string,
  source: string,
  kind: string,
  now: number = Date.now(),
): void {
  db.insert(recommendationCache)
    .values({
      userId,
      source,
      kind,
      status: "warming",
      inflight: 0,
      payload: null,
      lastError: null,
      fetchedAt: null,
      nextRefreshAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        recommendationCache.userId,
        recommendationCache.source,
        recommendationCache.kind,
      ],
    })
    .run();
}

export function resetWarmingForUser(
  userId: string,
  now: number = Date.now(),
): void {
  db.update(recommendationCache)
    .set({
      status: "warming",
      payload: null,
      lastError: null,
      inflight: 0,
      nextRefreshAt: now,
      updatedAt: now,
    })
    .where(eq(recommendationCache.userId, userId))
    .run();
}

export function claimForRefresh(
  id: string,
  now: number = Date.now(),
): RecommendationCacheRow | null {
  const row = db
    .update(recommendationCache)
    .set({ inflight: 1, updatedAt: now })
    .where(
      and(eq(recommendationCache.id, id), eq(recommendationCache.inflight, 0)),
    )
    .returning()
    .get();
  return row ?? null;
}

export function writeReady(
  id: string,
  payload: string,
  fetchedAt: number,
  nextRefreshAt: number,
): void {
  db.update(recommendationCache)
    .set({
      status: "ready",
      payload,
      lastError: null,
      inflight: 0,
      fetchedAt,
      nextRefreshAt,
      updatedAt: fetchedAt,
    })
    .where(eq(recommendationCache.id, id))
    .run();
}

export function writeError(
  id: string,
  errMessage: string,
  nextRefreshAt: number,
  now: number = Date.now(),
): void {
  db.update(recommendationCache)
    .set({
      status: "error",
      lastError: errMessage,
      inflight: 0,
      nextRefreshAt,
      updatedAt: now,
    })
    .where(eq(recommendationCache.id, id))
    .run();
}

export function resetInflightOnBoot(): void {
  db.update(recommendationCache)
    .set({ inflight: 0 })
    .where(eq(recommendationCache.inflight, 1))
    .run();
}

export function deleteForUser(userId: string): void {
  db.delete(recommendationCache)
    .where(eq(recommendationCache.userId, userId))
    .run();
}

export function findUserIdsWithListenbrainzToken(): string[] {
  const rows = db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(isNotNull(userSettings.listenbrainzToken))
    .all();
  return rows.map((r) => r.userId);
}
