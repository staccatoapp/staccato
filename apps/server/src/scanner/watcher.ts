import chokidar from "chokidar";
import { scanProgress, startScan } from "./index.js";
import { deleteTrackByPath } from "../db/queries/tracks.js";
import { isAudioFile } from "./walk.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "watcher" });

const DEBOUNCE_MS = 5000;

export function startWatcher(musicDir: string): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleScan = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (scanProgress.running) return;
      startScan(musicDir).catch((err) =>
        log.error({ err }, "watcher-triggered scan failed"),
      );
    }, DEBOUNCE_MS);
  };

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
      scheduleScan();
    })
    .on("change", (path) => {
      log.debug({ path }, "file changed");
      scheduleScan();
    })
    .on("unlink", (path) => {
      log.debug({ path }, "file removed");
      deleteTrackByPath(path);
    })
    .on("error", (err) => log.error({ err }, "watcher error"));

  log.info({ musicDir }, "watching music directory");
}
