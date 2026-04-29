import { db } from "../client.js";
import { listeningHistory } from "../schema/listening-history.js";

export type ListenHistoryRow = typeof listeningHistory.$inferSelect;

export function insertListenEvent(
  userId: string,
  trackId: string,
): ListenHistoryRow {
  return db
    .insert(listeningHistory)
    .values({ userId, trackId, scrobbledToListenbrainz: true })
    .returning()
    .get()!;
}
