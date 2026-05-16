import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { listeningHistory } from "../schema/listening-history.js";

export type ListenHistoryRow = typeof listeningHistory.$inferSelect;

export function insertListenEvent(
  userId: string,
  trackId: string,
): ListenHistoryRow {
  return db
    .insert(listeningHistory)
    .values({ userId, trackId, scrobbledToListenbrainz: false })
    .returning()
    .get()!;
}

export function markScrobbled(listenId: string): void {
  db.update(listeningHistory)
    .set({ scrobbledToListenbrainz: true })
    .where(eq(listeningHistory.id, listenId))
    .run();
}
