import { LidarrClient } from "./client.js";
import { getOrCreateServerSettings } from "../db/queries/server-settings.js";
import {
  getActiveDownloadRequests,
  updateDownloadRequest,
} from "../db/queries/download-requests.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "lidarr-poller" });

async function pollLidarrRequests(): Promise<void> {
  const settings = getOrCreateServerSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey) return;

  const active = getActiveDownloadRequests();
  log.debug({ activeCount: active.length }, "lidarr poll tick");
  if (active.length === 0) return;

  const albumIds = active
    .map((req) => req.lidarrAlbumId)
    .filter((id): id is number => id != null);
  if (albumIds.length === 0) return;

  const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);
  const [albums, queue] = await Promise.all([
    client.getAlbumsByIds(albumIds),
    client.getQueue(),
  ]);

  const albumById = new Map(albums.map((album) => [album.id, album]));
  const queuedAlbumIds = new Set(queue.map((item) => item.albumId));

  for (const req of active) {
    if (req.lidarrAlbumId == null) continue;

    const album = albumById.get(req.lidarrAlbumId);
    if (!album) continue;

    const stats = album.statistics;
    const isImported =
      stats != null &&
      stats.trackCount > 0 &&
      stats.trackFileCount >= stats.trackCount;

    if (isImported) {
      log.info(
        { requestId: req.id, lidarrAlbumId: req.lidarrAlbumId },
        "download completed",
      );
      updateDownloadRequest(req.id, { status: "completed" });
      continue;
    }

    if (req.status === "sent_to_lidarr" && queuedAlbumIds.has(req.lidarrAlbumId)) {
      log.info(
        { requestId: req.id, lidarrAlbumId: req.lidarrAlbumId },
        "download entered lidarr queue",
      );
      updateDownloadRequest(req.id, { status: "downloading" });
    }
  }
}

export function startLidarrPoller(): void {
  log.info("lidarr poller started");
  setInterval(() => {
    pollLidarrRequests().catch((err) =>
      log.error({ err }, "lidarr poll failed"),
    );
  }, 60_000);
}
