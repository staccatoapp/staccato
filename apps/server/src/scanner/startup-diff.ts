import { getAllTrackFilePaths, deleteTrackByPath } from "../db/queries/tracks.js";
import { walkAudioFiles } from "./walk.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "startup-diff" });

export function reconcileWithFilesystem(musicDir: string): void {
  const onDisk = new Set([...walkAudioFiles(musicDir)]);
  const inDb = getAllTrackFilePaths();

  let removedCount = 0;
  for (const dbPath of inDb) {
    if (!onDisk.has(dbPath)) {
      log.debug({ dbPath }, "removing deleted track");
      deleteTrackByPath(dbPath);
      removedCount++;
    }
  }

  const newCount = [...onDisk].filter((p) => !inDb.includes(p)).length;
  log.info({ removedCount, newCount }, "filesystem reconciled");
}
