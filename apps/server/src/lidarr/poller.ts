import { LidarrClient } from "./client.js";
import { getOrCreateServerSettings } from "../db/queries/server-settings.js";
import {
  getActiveDownloadRequests,
  updateDownloadRequest,
} from "../db/queries/download-requests.js";

async function pollLidarrQueue(): Promise<void> {
  const settings = getOrCreateServerSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey) return;

  const active = getActiveDownloadRequests();
  if (active.length === 0) return;

  const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);
  const queue = await client.getQueue();
  const queuedAlbumIds = new Set(queue.map((item) => item.albumId));

  for (const req of active) {
    if (req.lidarrAlbumId == null) continue;

    const inQueue = queuedAlbumIds.has(req.lidarrAlbumId);

    if (req.status === "sent_to_lidarr" && inQueue) {
      updateDownloadRequest(req.id, { status: "downloading" });
    } else if (req.status === "downloading" && !inQueue) {
      // Lidarr removes items from queue on completion AND on failure/cancellation.
      // We optimistically mark completed; Lidarr's own UI remains the source of truth.
      updateDownloadRequest(req.id, { status: "completed" });
    }
  }
}

export function startLidarrPoller(): void {
  setInterval(() => {
    pollLidarrQueue().catch((err) =>
      console.error("[lidarr-poller] error", err),
    );
  }, 60_000);
}
