import { FastifyBaseLogger } from "fastify";
import { LidarrClient, LidarrAlbum } from "./client.js";
import { serverConfig } from "../config/server-config.js";
import {
  getDownloadRequest,
  updateDownloadRequest,
} from "../db/queries/download-requests.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAlbum(
  client: LidarrClient,
  lidarrArtistId: number,
  releaseGroupMbid: string,
  log: FastifyBaseLogger,
  attempts = 5,
  delayMs = 3000,
): Promise<LidarrAlbum | undefined> {
  for (let i = 0; i < attempts; i++) {
    const albums = await client.getAlbumsForArtist(lidarrArtistId);
    const match = albums.find((a) => a.foreignAlbumId === releaseGroupMbid);
    log.info(
      {
        attempt: i + 1,
        attempts,
        albumCount: albums.length,
        match: match
          ? { id: match.id, title: match.title, monitored: match.monitored }
          : null,
      },
      "[lidarr] waitForAlbum poll",
    );
    if (match) return match;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return undefined;
}

export async function submitToLidarr(
  requestId: string,
  log: FastifyBaseLogger,
  override?: { qualityProfileId?: number },
): Promise<void> {
  const req = getDownloadRequest(requestId);
  if (!req) throw new Error(`Download request ${requestId} not found`);

  log.info(
    {
      requestId,
      artistMbid: req.musicbrainzArtistId,
      releaseGroupMbid: req.musicbrainzReleaseGroupId,
      artistName: req.artistName,
      albumTitle: req.albumTitle,
    },
    "[lidarr] submit start",
  );

  const { lidarr } = serverConfig.get();
  if (!lidarr.url || !lidarr.apiKey) {
    log.warn({ requestId }, "[lidarr] not configured, marking failed");
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: "Lidarr not configured",
    });
    return;
  }

  const qualityProfileId =
    override?.qualityProfileId ?? lidarr.qualityProfileId;
  const metadataProfileId = lidarr.metadataProfileId;
  const rootFolderPath = lidarr.rootFolderPath;
  if (
    qualityProfileId == null ||
    metadataProfileId == null ||
    rootFolderPath == null
  ) {
    log.warn(
      {
        requestId,
        qualityProfileId,
        metadataProfileId,
        rootFolderPath,
      },
      "[lidarr] defaults not configured, marking failed",
    );
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: "Lidarr defaults not configured",
    });
    return;
  }

  if (!req.musicbrainzArtistId || !req.musicbrainzReleaseGroupId) {
    log.warn(
      {
        requestId,
        artistMbid: req.musicbrainzArtistId,
        releaseGroupMbid: req.musicbrainzReleaseGroupId,
      },
      "[lidarr] missing MBIDs, marking failed",
    );
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: "Missing MusicBrainz artist or release group ID",
    });
    return;
  }

  const client = new LidarrClient(lidarr.url, lidarr.apiKey);

  try {
    log.info(
      { qualityProfileId, metadataProfileId, rootFolderPath },
      "[lidarr] using defaults",
    );

    const artists = await client.getArtists();
    let lidarrArtist = artists.find(
      (a) => a.foreignArtistId === req.musicbrainzArtistId,
    );

    if (!lidarrArtist) {
      log.info(
        { artistMbid: req.musicbrainzArtistId },
        "[lidarr] artist not found, adding",
      );
      lidarrArtist = await client.addArtist({
        artistMbid: req.musicbrainzArtistId,
        artistName: req.artistName,
        qualityProfileId,
        metadataProfileId,
        rootFolderPath,
      });
      log.info({ lidarrArtistId: lidarrArtist.id }, "[lidarr] artist added");
    } else {
      log.info(
        { lidarrArtistId: lidarrArtist.id, name: lidarrArtist.artistName },
        "[lidarr] artist already present",
      );
    }

    const album = await waitForAlbum(
      client,
      lidarrArtist.id,
      req.musicbrainzReleaseGroupId,
      log,
    );
    if (!album) {
      log.warn(
        {
          lidarrArtistId: lidarrArtist.id,
          releaseGroupMbid: req.musicbrainzReleaseGroupId,
        },
        "[lidarr] album not found after waitForAlbum, marking failed",
      );
      updateDownloadRequest(requestId, {
        status: "failed",
        errorMessage: "Album not found in Lidarr after artist add",
      });
      return;
    }

    if (!album.monitored) {
      log.info({ albumId: album.id }, "[lidarr] setting album monitored");
      await client.setAlbumMonitored(album.id, true);
    } else {
      log.info({ albumId: album.id }, "[lidarr] album already monitored");
    }

    log.info({ albumId: album.id }, "[lidarr] triggering album search");
    await client.triggerAlbumSearch(album.id);

    log.info(
      { requestId, lidarrAlbumId: album.id },
      "[lidarr] submit complete",
    );
    updateDownloadRequest(requestId, {
      status: "sent_to_lidarr",
      lidarrAlbumId: album.id,
    });
  } catch (err) {
    log.error({ err, requestId }, "[lidarr] submit failed");
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
