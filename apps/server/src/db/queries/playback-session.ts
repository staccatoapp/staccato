import { eq } from "drizzle-orm";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../client.js";
import { playbackSession } from "../schema/playback-session.js";

export type PlaybackSessionRow = typeof playbackSession.$inferSelect;
export type PlaybackSessionUpdate = SQLiteUpdateSetSource<
  typeof playbackSession
>;

export function getOrCreatePlaybackSession(userId: string): PlaybackSessionRow {
  return db
    .insert(playbackSession)
    .values({ userId, trackQueue: [] })
    .onConflictDoUpdate({
      target: playbackSession.userId,
      set: { userId },
    })
    .returning()
    .get()!;
}

export function updatePlaybackSession(
  userId: string,
  data: PlaybackSessionUpdate,
): PlaybackSessionRow {
  return db
    .update(playbackSession)
    .set(data)
    .where(eq(playbackSession.userId, userId))
    .returning()
    .get()!;
}

export function appendToQueue(
  userId: string,
  trackIds: string[],
): PlaybackSessionRow {
  return db.transaction((tx) => {
    const current = tx
      .select({ trackQueue: playbackSession.trackQueue })
      .from(playbackSession)
      .where(eq(playbackSession.userId, userId))
      .get();
    const next = (current?.trackQueue ?? []).concat(trackIds);
    return tx
      .update(playbackSession)
      .set({ trackQueue: next })
      .where(eq(playbackSession.userId, userId))
      .returning()
      .get()!;
  });
}
