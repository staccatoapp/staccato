import { db } from "../db/index.js";
import { previewCache } from "../db/schema/preview-cache.js";
import { eq } from "drizzle-orm";
import { lookupDeezerPreview } from "./deezer.js";
import { lookupItunesPreview } from "./itunes.js";

export interface PreviewResolution {
  previewUrl: string | null;
  source: "deezer" | "itunes" | "none";
}

export async function resolvePreview(
  recordingMbid: string,
  artistName: string,
  trackTitle: string,
): Promise<PreviewResolution> {
  const cached = db
    .select()
    .from(previewCache)
    .where(eq(previewCache.musicbrainzRecordingId, recordingMbid))
    .get();

  if (cached) {
    return {
      previewUrl: cached.previewUrl ?? null,
      source: cached.source ?? "none",
    };
  }

  const deezer = await lookupDeezerPreview(artistName, trackTitle);
  if (deezer) {
    db.insert(previewCache)
      .values({
        musicbrainzRecordingId: recordingMbid,
        deezerTrackId: deezer.deezerTrackId,
        previewUrl: deezer.previewUrl,
        source: "deezer",
      })
      .run();
    return { previewUrl: deezer.previewUrl, source: "deezer" };
  }

  const itunes = await lookupItunesPreview(artistName, trackTitle);
  if (itunes) {
    db.insert(previewCache)
      .values({
        musicbrainzRecordingId: recordingMbid,
        itunesTrackId: itunes.itunesTrackId,
        previewUrl: itunes.previewUrl,
        source: "itunes",
      })
      .run();
    return { previewUrl: itunes.previewUrl, source: "itunes" };
  }

  // Negative cache — no preview found
  db.insert(previewCache)
    .values({ musicbrainzRecordingId: recordingMbid, source: "none" })
    .run();
  return { previewUrl: null, source: "none" };
}
