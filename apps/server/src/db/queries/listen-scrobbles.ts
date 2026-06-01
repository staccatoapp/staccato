import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { listenScrobbles } from "../schema/listen-scrobbles.js";

export type ListenScrobbleRow = typeof listenScrobbles.$inferSelect;
export type ScrobbleStatus = ListenScrobbleRow["status"];

export function createPendingScrobble(listenId: string, target: string): void {
  db.insert(listenScrobbles)
    .values({ listenId, target, status: "pending" })
    .run();
}

export function markScrobble(
  listenId: string,
  target: string,
  status: ScrobbleStatus,
  lastError?: string,
): void {
  db.update(listenScrobbles)
    .set({
      status,
      lastError: lastError ?? null,
      updatedAt: sql`(unixepoch())`,
    })
    .where(
      and(
        eq(listenScrobbles.listenId, listenId),
        eq(listenScrobbles.target, target),
      ),
    )
    .run();
}
