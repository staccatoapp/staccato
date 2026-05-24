import { logger } from "../logger.js";
import { reconcile } from "./reconcile.js";
import { startWatcher } from "./watcher.js";
import { drain, enqueueDiscovery, enqueueResolution, queueSize } from "./queue.js";
import { walkAudioFiles } from "./walk.js";
import {
  completeProgress,
  libraryProgress,
  resetProgress,
} from "./state.js";
import {
  getFailedTrackPaths,
  getLowConfidenceTrackPaths,
  resetTracksToPending,
} from "../db/queries/tracks.js";
import { deleteOrphanArtists } from "../db/queries/artists.js";
import { deleteOrphanAlbums } from "../db/queries/albums.js";
import { isFpcalcAvailable } from "./evidence/fingerprint.js";
import { isAcoustidConfigured } from "./evidence/acoustid.js";

const log = logger.child({ module: "library" });

export { libraryProgress } from "./state.js";

// Sweep placeholder rows that resolution left behind: discovered artist rows
// not adopted by any lead credit (name mismatch, or a true Various-Artists
// folder), and albums whose tracks all moved elsewhere. Safe to run at drain —
// a row is only orphan-eligible once all its tracks/albums have repointed away.
// Albums first, so an artist whose sole album just dropped is then collected.
function sweepOrphans(): void {
  deleteOrphanAlbums();
  deleteOrphanArtists();
}

export async function startLibraryPipeline(musicDir: string): Promise<void> {
  resetProgress();

  const [fpcalcOk, acoustidOk] = await Promise.all([
    isFpcalcAvailable(),
    Promise.resolve(isAcoustidConfigured()),
  ]);
  if (!fpcalcOk) {
    log.warn(
      "fpcalc not available — acoustid resolution will be skipped. install chromaprint and set STACCATO_SERVER_FPCALC_PATH if needed.",
    );
  }
  if (!acoustidOk) {
    log.warn(
      "STACCATO_SERVER_ACOUSTID_API_KEY not set — acoustid resolution will be skipped",
    );
  }

  const { discovered, pendingResolution } = await reconcile(musicDir);
  libraryProgress.total = discovered + pendingResolution;
  startWatcher(musicDir);

  // Wait for the queue to drain so we can record completion; the watcher
  // keeps the process alive and continues to feed the queue for new files.
  void (async () => {
    await drain();
    sweepOrphans();
    completeProgress();
    log.info(
      {
        scanned: libraryProgress.scanned,
        resolved: libraryProgress.resolved,
        failed: libraryProgress.failed,
      },
      "initial library pipeline drain complete",
    );
  })();

  log.info({ musicDir }, "library pipeline started");
}

// Manual re-scan: re-enqueue every audio file in the directory. Existing
// resolved tracks short-circuit on mtime, so this is cheap.
export async function startManualScan(musicDir: string): Promise<void> {
  resetProgress();
  let count = 0;
  for await (const p of walkAudioFiles(musicDir)) {
    enqueueDiscovery(p);
    count++;
  }
  libraryProgress.total = count;
  log.info({ musicDir, count }, "manual scan enqueued");
  void (async () => {
    await drain();
    sweepOrphans();
    completeProgress();
  })();
}

export type RetryScope = "failed" | "low_confidence";

export interface RetryOptions {
  scope: RetryScope;
  threshold?: number;
}

export async function retryResolution(
  opts: RetryOptions,
): Promise<{ reenqueued: number }> {
  const targets =
    opts.scope === "failed"
      ? getFailedTrackPaths()
      : getLowConfidenceTrackPaths(opts.threshold ?? 0.85);
  if (targets.length === 0) return { reenqueued: 0 };
  resetTracksToPending(targets.map((t) => t.id));
  for (const t of targets) {
    enqueueResolution(t.filePath);
  }
  log.info(
    { scope: opts.scope, count: targets.length },
    "resolution retry enqueued",
  );
  return { reenqueued: targets.length };
}

export function describePipeline(): {
  queueSize: number;
} {
  return { queueSize: queueSize() };
}
