import chokidar from "chokidar";
import { scanProgress, startScan } from "./index.js";
import { deleteTrackByPath } from "./upsert.js";

const AUDIO_EXTENSIONS = /\.(flac|mp3|m4a|ogg|opus|wav|aiff|wv|ape)$/i;
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
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    })
    .on("add", (path) => {
      if (!AUDIO_EXTENSIONS.test(path)) return;
      console.log(`[watcher] file added: ${path}`);
      scheduleScan();
    })
    .on("change", (path) => {
      if (!AUDIO_EXTENSIONS.test(path)) return;
      console.log(`[watcher] file changed: ${path}`);
      scheduleScan();
    })
    .on("unlink", (path) => {
      if (!AUDIO_EXTENSIONS.test(path)) return;
      console.log(`[watcher] file removed: ${path}`);
      deleteTrackByPath(path);
    })
    .on("error", (err) => console.error("[watcher] error", err));

  console.log(`[watcher] watching ${musicDir}`);
}
