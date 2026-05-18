import { and, eq, or } from "drizzle-orm";
import { db } from "../client.js";
import { downloadRequests } from "../schema/download-requests.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

export type DownloadRequestRow = typeof downloadRequests.$inferSelect;
export type NewDownloadRequestRow = typeof downloadRequests.$inferInsert;
export type DownloadRequestUpdate = SQLiteUpdateSetSource<typeof downloadRequests>;

export function getDownloadRequest(id: string): DownloadRequestRow | undefined {
  return db.select().from(downloadRequests).where(eq(downloadRequests.id, id)).get();
}

export function getDownloadRequestsByUser(userId: string): DownloadRequestRow[] {
  return db
    .select()
    .from(downloadRequests)
    .where(eq(downloadRequests.userId, userId))
    .all();
}

export function getActiveDownloadRequests(): DownloadRequestRow[] {
  return db
    .select()
    .from(downloadRequests)
    .where(
      or(
        eq(downloadRequests.status, "sent_to_lidarr"),
        eq(downloadRequests.status, "downloading"),
      ),
    )
    .all();
}

export function findExistingActiveRequest(
  userId: string,
  releaseGroupMbid: string,
): DownloadRequestRow | undefined {
  return db
    .select()
    .from(downloadRequests)
    .where(
      and(
        eq(downloadRequests.userId, userId),
        eq(downloadRequests.musicbrainzReleaseGroupId, releaseGroupMbid),
        or(
          eq(downloadRequests.status, "requested"),
          eq(downloadRequests.status, "sent_to_lidarr"),
          eq(downloadRequests.status, "downloading"),
        ),
      ),
    )
    .get();
}

export function createDownloadRequest(data: NewDownloadRequestRow): DownloadRequestRow {
  return db.insert(downloadRequests).values(data).returning().get()!;
}

export function updateDownloadRequest(
  id: string,
  data: DownloadRequestUpdate,
): DownloadRequestRow {
  return db
    .update(downloadRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(downloadRequests.id, id))
    .returning()
    .get()!;
}

export function deleteDownloadRequest(id: string, userId: string): boolean {
  const result = db
    .delete(downloadRequests)
    .where(
      and(
        eq(downloadRequests.id, id),
        eq(downloadRequests.userId, userId),
      ),
    )
    .run();
  return result.changes > 0;
}
