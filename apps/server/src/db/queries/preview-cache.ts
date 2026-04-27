import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { previewCache } from "../schema/index.js";

export function getCachedPreview(
  recordingMbid: string,
): PreviewCacheRow | undefined {
  return db
    .select()
    .from(previewCache)
    .where(eq(previewCache.musicbrainzRecordingId, recordingMbid))
    .get();
}

export function insertCachedPreview(
  newPreviewCacheRow: NewPreviewCacheRow,
): void {
  db.insert(previewCache)
    .values({
      musicbrainzRecordingId: newPreviewCacheRow.musicbrainzRecordingId,
      deezerTrackId: newPreviewCacheRow.deezerTrackId,
      itunesTrackId: newPreviewCacheRow.itunesTrackId,
      previewUrl: newPreviewCacheRow.previewUrl,
      source: newPreviewCacheRow.source,
    })
    .run();
}

export type PreviewCacheRow = typeof previewCache.$inferSelect;
export type NewPreviewCacheRow = typeof previewCache.$inferInsert;
