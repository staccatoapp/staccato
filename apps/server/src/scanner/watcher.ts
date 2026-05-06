import chokidar from "chokidar";
import { scanProgress, startScan } from "./index.js";
import { deleteTrackByPath } from "../db/queries/tracks.js";
import { isAudioFile } from "./walk.js";

const DEBOUNCE_MS = 5000;

export function startWatcher(musicDir: string): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleScan = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (scanProgress.running) return;
      startScan(musicDir).catch((err) =>
        console.error("[watcher] scan error", err),
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
      console.log(`[watcher] file added: ${path}`);
      scheduleScan();
    })
    .on("change", (path) => {
      console.log(`[watcher] file changed: ${path}`);
      scheduleScan();
    })
    .on("unlink", (path) => {
      console.log(`[watcher] file removed: ${path}`);
      deleteTrackByPath(path);
    })
    .on("error", (err) => console.error("[watcher] error", err));

  console.log(`[watcher] watching ${musicDir}`);
}
