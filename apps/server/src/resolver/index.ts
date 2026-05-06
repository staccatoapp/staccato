import { type ResolutionProgress } from "./types.js";
import { markRemainingPendingAsFailed } from "../db/queries/tracks.js";
import { runTagResolutionPass } from "./passes/tag-resolution.js";
import { runAlbumFirstPass } from "./passes/album-first.js";
import { runRecordingSearchFallback } from "./passes/recording-search-fallback.js";
import { runCoverArtRetryPass } from "./passes/cover-art-retry.js";
import { runFingerprintPass } from "./passes/fingerprint.js";
import { runAlbumBackfillFromTracks } from "./passes/album-backfill.js";
import { dedupeArtistsAndAlbums } from "./passes/dedupe.js";
import { runArtistImagePass } from "./passes/artist-image.js";

export type { ResolutionProgress };

export let resolutionProgress: ResolutionProgress = {
  running: false,
  resolved: 0,
  failed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
};

export async function startResolution(): Promise<void> {
  if (resolutionProgress.running) {
    console.log("[resolver] already running, skipping");
    return;
  }
  resolutionProgress = {
    running: true,
    resolved: 0,
    failed: 0,
    total: 0,
    startedAt: new Date(),
    completedAt: null,
  };

  try {
    await runTagResolutionPass(resolutionProgress);
    await runAlbumFirstPass(resolutionProgress);
    await runRecordingSearchFallback(resolutionProgress);
    await runCoverArtRetryPass();
    await runFingerprintPass(resolutionProgress);
    await runAlbumBackfillFromTracks();
    dedupeArtistsAndAlbums();
    await runArtistImagePass();
    markRemainingPendingAsFailed();
    resolutionProgress.completedAt = new Date();
  } catch (err) {
    console.error("[resolver] fatal error", err);
  } finally {
    resolutionProgress.running = false;
  }
}
