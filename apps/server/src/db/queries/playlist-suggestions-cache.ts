import { and, eq, lte } from "drizzle-orm";
import { db } from "../client.js";
import {
  playlistSuggestionsCache,
  type PlaylistSuggestionsCacheRow,
} from "../schema/playlist-suggestions-cache.js";

export function findDueSuggestionRowIds(now: number): string[] {
  const rows = db
    .select({ id: playlistSuggestionsCache.id })
    .from(playlistSuggestionsCache)
    .where(
      and(
        lte(playlistSuggestionsCache.nextRefreshAt, now),
        eq(playlistSuggestionsCache.inflight, 0),
      ),
    )
    .all();
  return rows.map((r) => r.id);
}

export function getSuggestionRow(
  userId: string,
  playlistId: string,
): PlaylistSuggestionsCacheRow | undefined {
  return db
    .select()
    .from(playlistSuggestionsCache)
    .where(
      and(
        eq(playlistSuggestionsCache.userId, userId),
        eq(playlistSuggestionsCache.playlistId, playlistId),
      ),
    )
    .get();
}

export function findSuggestionRowById(
  id: string,
): PlaylistSuggestionsCacheRow | undefined {
  return db
    .select()
    .from(playlistSuggestionsCache)
    .where(eq(playlistSuggestionsCache.id, id))
    .get();
}

export function upsertWarmingSuggestionRow(
  userId: string,
  playlistId: string,
  now: number = Date.now(),
): void {
  db.insert(playlistSuggestionsCache)
    .values({
      userId,
      playlistId,
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
        playlistSuggestionsCache.userId,
        playlistSuggestionsCache.playlistId,
      ],
    })
    .run();
}

export function claimSuggestionForRefresh(
  id: string,
  now: number = Date.now(),
): PlaylistSuggestionsCacheRow | null {
  const row = db
    .update(playlistSuggestionsCache)
    .set({ inflight: 1, updatedAt: now })
    .where(
      and(
        eq(playlistSuggestionsCache.id, id),
        eq(playlistSuggestionsCache.inflight, 0),
      ),
    )
    .returning()
    .get();
  return row ?? null;
}

export function writeSuggestionReady(
  id: string,
  payload: string,
  fetchedAt: number,
  nextRefreshAt: number,
): void {
  db.update(playlistSuggestionsCache)
    .set({
      status: "ready",
      payload,
      lastError: null,
      inflight: 0,
      fetchedAt,
      nextRefreshAt,
      updatedAt: fetchedAt,
    })
    .where(eq(playlistSuggestionsCache.id, id))
    .run();
}

export function writeSuggestionError(
  id: string,
  errMessage: string,
  nextRefreshAt: number,
  now: number = Date.now(),
): void {
  db.update(playlistSuggestionsCache)
    .set({
      status: "error",
      lastError: errMessage,
      inflight: 0,
      nextRefreshAt,
      updatedAt: now,
    })
    .where(eq(playlistSuggestionsCache.id, id))
    .run();
}

/** Trailing-debounce: on a playlist edit, pull the row's next recompute forward
 * to `nextRefreshAt`. No-op when no row exists (created lazily on first view).
 * SP3 design §9.2. Edge case: an edit during an in-flight refresh is overwritten
 * by the completing writeSuggestionReady (+24h); acceptable for v1. */
export function markSuggestionStale(
  userId: string,
  playlistId: string,
  nextRefreshAt: number,
  now: number = Date.now(),
): void {
  db.update(playlistSuggestionsCache)
    .set({ nextRefreshAt, updatedAt: now })
    .where(
      and(
        eq(playlistSuggestionsCache.userId, userId),
        eq(playlistSuggestionsCache.playlistId, playlistId),
      ),
    )
    .run();
}

export function resetInflightSuggestionsOnBoot(): void {
  db.update(playlistSuggestionsCache)
    .set({ inflight: 0 })
    .where(eq(playlistSuggestionsCache.inflight, 1))
    .run();
}

export function deleteSuggestionRow(id: string): void {
  db.delete(playlistSuggestionsCache)
    .where(eq(playlistSuggestionsCache.id, id))
    .run();
}
