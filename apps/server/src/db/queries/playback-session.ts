import { eq } from "drizzle-orm";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../client.js";
import { playbackSession } from "../schema/playback-session.js";

export type PlaybackSessionRow = typeof playbackSession.$inferSelect;
export type PlaybackSessionUpdate = SQLiteUpdateSetSource<
  typeof playbackSession
>;

export function getOrCreatePlaybackSession(
  userId: string,
): PlaybackSessionRow {
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
): void {
  db.update(playbackSession)
    .set(data)
    .where(eq(playbackSession.userId, userId))
    .run();
}
