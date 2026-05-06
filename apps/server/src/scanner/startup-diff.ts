import { getAllTrackFilePaths, deleteTrackByPath } from "../db/queries/tracks.js";
import { walkAudioFiles } from "./walk.js";

export function reconcileWithFilesystem(musicDir: string): void {
  const onDisk = new Set([...walkAudioFiles(musicDir)]);
  const inDb = getAllTrackFilePaths();

  let removedCount = 0;
  for (const dbPath of inDb) {
    if (!onDisk.has(dbPath)) {
      console.log(`[startup-diff] removing deleted track: ${dbPath}`);
      deleteTrackByPath(dbPath);
      removedCount++;
    }
  }

  const newCount = [...onDisk].filter((p) => !inDb.includes(p)).length;
  console.log(`[startup-diff] removed ${removedCount} stale, ${newCount} new queued for scan`);
}
