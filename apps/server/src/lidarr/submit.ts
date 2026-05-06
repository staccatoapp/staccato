import { LidarrClient, LidarrAlbum } from "./client.js";
import { getOrCreateServerSettings } from "../db/queries/server-settings.js";
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
  attempts = 5,
  delayMs = 3000,
): Promise<LidarrAlbum | undefined> {
  for (let i = 0; i < attempts; i++) {
    const albums = await client.getAlbumsForArtist(lidarrArtistId);
    const match = albums.find((a) => a.foreignAlbumId === releaseGroupMbid);
    if (match) return match;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return undefined;
}

export async function submitToLidarr(requestId: string): Promise<void> {
  const req = getDownloadRequest(requestId);
  if (!req) throw new Error(`Download request ${requestId} not found`);

  const settings = getOrCreateServerSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey) {
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: "Lidarr not configured",
    });
    return;
  }

  if (!req.musicbrainzArtistId || !req.musicbrainzReleaseGroupId) {
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: "Missing MusicBrainz artist or release group ID",
    });
    return;
  }

  const client = new LidarrClient(settings.lidarrUrl, settings.lidarrApiKey);

  try {
    const defaults = await client.getDefaults();

    const artists = await client.getArtists();
    let lidarrArtist = artists.find(
      (a) => a.foreignArtistId === req.musicbrainzArtistId,
    );

    if (!lidarrArtist) {
      lidarrArtist = await client.addArtist({
        artistMbid: req.musicbrainzArtistId,
        artistName: req.artistName,
        qualityProfileId: defaults.qualityProfileId,
        metadataProfileId: defaults.metadataProfileId,
        rootFolderPath: defaults.rootFolderPath,
      });
    }

    const album = await waitForAlbum(
      client,
      lidarrArtist.id,
      req.musicbrainzReleaseGroupId,
    );
    if (!album) {
      updateDownloadRequest(requestId, {
        status: "failed",
        errorMessage: "Album not found in Lidarr after artist add",
      });
      return;
    }

    if (!album.monitored) {
      await client.setAlbumMonitored(album.id, true);
    }

    await client.triggerAlbumSearch(album.id);

    updateDownloadRequest(requestId, {
      status: "sent_to_lidarr",
      lidarrAlbumId: album.id,
    });
  } catch (err) {
    updateDownloadRequest(requestId, {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
