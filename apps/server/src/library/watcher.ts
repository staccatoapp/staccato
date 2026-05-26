import chokidar from "chokidar";
import { logger } from "../logger.js";
import { enqueueDiscovery } from "./queue.js";
import { isAudioFile } from "./walk.js";
import {
  markPathPendingRemoval,
  janitorSweepPendingRemoval,
} from "./worker.js";

const log = logger.child({ module: "library:watcher" });

// Pending-removal window. When a file disappears we mark its row instead of
// deleting; if a matching file (by chromaprint) reappears within the window
// the row reattaches at the new path. 5 minutes is long enough for fpcalc
// to finish on the newly-arrived file so rename detection can match by
// fingerprint rather than the weaker tag heuristic.
const PENDING_REMOVAL_WINDOW_MS = 5 * 60 * 1000;
const JANITOR_INTERVAL_MS = 60 * 1000;

let janitorTimer: ReturnType<typeof setInterval> | null = null;

export function startWatcher(musicDir: string): void {
  chokidar
    .watch(musicDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
      ignored: (path, stats) => !stats?.isFile() || !isAudioFile(path),
    })
    .on("add", (path) => {
      log.debug({ path }, "file added");
      enqueueDiscovery(path);
    })
    .on("change", (path) => {
      log.debug({ path }, "file changed");
      enqueueDiscovery(path);
    })
    .on("unlink", (path) => {
      log.debug({ path }, "file removed (marked pending_removal)");
      markPathPendingRemoval(path);
    })
    .on("error", (err) => log.error({ err }, "watcher error"));

  if (!janitorTimer) {
    janitorTimer = setInterval(() => {
      const cutoff = Date.now() - PENDING_REMOVAL_WINDOW_MS;
      void janitorSweepPendingRemoval(cutoff).catch((err) =>
        log.error({ err }, "janitor sweep failed"),
      );
    }, JANITOR_INTERVAL_MS);
  }

  log.info({ musicDir }, "watching music directory");
}
