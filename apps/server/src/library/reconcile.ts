import { logger } from "../logger.js";
import {
  getAllTrackFilePaths,
  getPendingTrackPaths,
  markPendingRemovalByPaths,
  resetResolvingToPending,
} from "../db/queries/tracks.js";
import { enqueueDiscovery, enqueueResolution } from "./queue.js";
import { walkAudioFiles } from "./walk.js";

const log = logger.child({ module: "library:reconcile" });

export async function reconcile(
  musicDir: string,
): Promise<{ discovered: number; pendingResolution: number }> {
  const resetCount = resetResolvingToPending();
  if (resetCount > 0) {
    log.info(
      { count: resetCount },
      "reset resolving tracks to pending on boot",
    );
  }

  const onDisk = new Set<string>();
  for await (const p of walkAudioFiles(musicDir)) {
    onDisk.add(p);
  }

  const inDb = new Set(getAllTrackFilePaths());

  const now = Date.now();
  const missingPaths = [...inDb].filter((p) => !onDisk.has(p));
  const pendingRemovalCount = markPendingRemovalByPaths(missingPaths, now);

  let enqueued = 0;
  for (const fsPath of onDisk) {
    if (!inDb.has(fsPath)) {
      enqueueDiscovery(fsPath);
      enqueued++;
    }
  }

  // Re-enqueue pending tracks straight to resolution — they are already
  // discovered (row exists), so re-running discovery would be wasted work.
  // Covers crash recovery + boot-time `resolving`→`pending` reset above.
  let pendingResolution = 0;
  for (const row of getPendingTrackPaths()) {
    if (onDisk.has(row.filePath)) {
      enqueueResolution(row.filePath);
      pendingResolution++;
    }
  }

  log.info(
    {
      onDiskCount: onDisk.size,
      inDbCount: inDb.size,
      newlyEnqueued: enqueued,
      pendingResolution,
      pendingRemoval: pendingRemovalCount,
    },
    "filesystem reconciled",
  );

  return { discovered: enqueued, pendingResolution };
}
