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
import { logger } from "../logger.js";

const log = logger.child({ module: "resolver" });

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
    log.debug("resolver already running, skipping");
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

  log.info("resolution pipeline starting");

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
    log.info(
      {
        resolved: resolutionProgress.resolved,
        failed: resolutionProgress.failed,
        total: resolutionProgress.total,
      },
      "resolution pipeline complete",
    );
  } catch (err) {
    log.error({ err }, "resolver pipeline failed");
  } finally {
    resolutionProgress.running = false;
  }
}
