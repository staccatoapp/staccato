import { normalizeString, throttledFetch } from "../../musicbrainz/client.js";
import { fetchAndStoreCoverArt } from "../utils.js";
import {
  getUnresolvedAlbumsContainingResolvedTracks,
  updateUnresolvedAlbum,
} from "../../db/queries/albums.js";
import { getResolvedTrackMbidsByAlbumId } from "../../db/queries/tracks.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:album-backfill" });

export async function runAlbumBackfillFromTracks(): Promise<void> {
  const albumsToBackfill = getUnresolvedAlbumsContainingResolvedTracks();

  if (albumsToBackfill.length === 0) return;
  log.info(
    { count: albumsToBackfill.length },
    "album backfill from tracks starting",
  );

  for (const album of albumsToBackfill) {
    const resolvedTrackMbids = getResolvedTrackMbidsByAlbumId(album.albumId);

    const normalizedAlbumTitle = normalizeString(album.title);
    let matchingRelease:
      | {
          id: string;
          title: string;
          status?: string;
          "release-group"?: { id: string };
        }
      | undefined;

    for (const recordingMbid of resolvedTrackMbids) {
      const res = await throttledFetch(
        `https://musicbrainz.org/ws/2/recording/${recordingMbid}?inc=releases+release-groups&fmt=json`,
      );
      if (!res.ok) continue;

      const data = (await res.json()) as {
        releases?: Array<{
          id: string;
          title: string;
          status?: string;
          "release-group"?: { id: string };
        }>;
      };

      if (!data.releases?.length) continue;

      const candidate =
        data.releases.find(
          (r) =>
            normalizeString(r.title) === normalizedAlbumTitle &&
            r.status === "Official",
        ) ??
        data.releases.find(
          (r) => normalizeString(r.title) === normalizedAlbumTitle,
        ) ??
        data.releases.find(
          (r) =>
            r.status === "Official" &&
            (normalizeString(r.title).includes(normalizedAlbumTitle) ||
              normalizedAlbumTitle.includes(normalizeString(r.title))),
        );

      if (candidate) {
        matchingRelease = candidate;
        break;
      }
    }

    if (!matchingRelease) {
      log.debug(
        {
          album: album.title,
          candidateCount: resolvedTrackMbids.length,
        },
        "no matching release found",
      );
      continue;
    }

    const releaseGroupMbid = matchingRelease["release-group"]?.id;
    updateUnresolvedAlbum(album.albumId, {
      canonicalTitle: matchingRelease.title,
      ...(releaseGroupMbid ? { releaseGroupMbid } : {}),
    });

    void fetchAndStoreCoverArt(album.albumId, releaseGroupMbid);
  }
}
