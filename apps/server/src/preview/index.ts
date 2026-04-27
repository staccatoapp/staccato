import { lookupDeezerPreview } from "./deezer.js";
import { lookupItunesPreview as iTunesLookupPreview } from "./itunes.js";
import {
  getCachedPreview,
  insertCachedPreview,
  NewPreviewCacheRow,
} from "../db/queries/preview-cache.js";
import { PreviewSource } from "../db/schema/preview-cache.js";

export interface PreviewResolution {
  previewUrl: string | null;
  source: PreviewSource;
}

export async function resolvePreview(
  recordingMbid: string,
  artistName: string,
  trackTitle: string,
): Promise<PreviewResolution> {
  const cached = getCachedPreview(recordingMbid);

  if (cached) {
    return {
      previewUrl: cached.previewUrl ?? null,
      source: cached.source ?? "none",
    };
  }

  const deezer = await lookupDeezerPreview(artistName, trackTitle);
  if (deezer) {
    const cachePreviewInsert: NewPreviewCacheRow = {
      musicbrainzRecordingId: recordingMbid,
      deezerTrackId: deezer.deezerTrackId,
      previewUrl: deezer.previewUrl,
      source: "deezer",
    };
    insertCachedPreview(cachePreviewInsert);

    return { previewUrl: deezer.previewUrl, source: "deezer" };
  }

  // named "iTunesLookupPreview" because "lookupItunesPreview" and "lookupITunesPreview" felt so wrong
  const iTunes = await iTunesLookupPreview(artistName, trackTitle);
  if (iTunes) {
    const cachePreviewInsert: NewPreviewCacheRow = {
      musicbrainzRecordingId: recordingMbid,
      itunesTrackId: iTunes.itunesTrackId,
      previewUrl: iTunes.previewUrl,
      source: "itunes",
    };
    insertCachedPreview(cachePreviewInsert);

    return { previewUrl: iTunes.previewUrl, source: "itunes" };
  }

  const negativeCachePreviewInsert: NewPreviewCacheRow = {
    musicbrainzRecordingId: recordingMbid,
    source: "none",
  };
  insertCachedPreview(negativeCachePreviewInsert);

  return { previewUrl: null, source: "none" };
}
