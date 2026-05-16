import {
  lookupExternalAlbum,
  searchReleaseGroupCandidates,
} from "../../musicbrainz/client.js";
import { fetchAndStoreCoverArt, matchLocalTracks, resolveArtistMbid } from "../utils.js";
import {
  getUnresolvedAlbums,
  updateUnresolvedAlbum,
} from "../../db/queries/albums.js";
import {
  countUnresolvedTracks,
  getUnresolvedTracksByAlbum,
  updateTrackByTrackId,
} from "../../db/queries/tracks.js";
import { type ResolutionProgress } from "../types.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:album-first" });

export async function runAlbumFirstPass(progress: ResolutionProgress): Promise<void> {
  progress.total = countUnresolvedTracks();

  const unresolvedAlbums = getUnresolvedAlbums();

  log.info({ count: unresolvedAlbums.length }, "album-first pass starting");

  for (const album of unresolvedAlbums) {
    const localTracks = getUnresolvedTracksByAlbum(album.albumId);

    if (localTracks.length === 0) continue;

    let releaseGroupCandidates = await searchReleaseGroupCandidates(
      album.title,
      album.artistName,
    );

    if (releaseGroupCandidates.length === 0) {
      const baseTitle = album.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (baseTitle !== album.title) {
        releaseGroupCandidates = await searchReleaseGroupCandidates(
          baseTitle,
          album.artistName,
        );
      }
    }

    for (const releaseGroupMbid of releaseGroupCandidates) {
      const externalAlbum = await lookupExternalAlbum(releaseGroupMbid);
      if (!externalAlbum) continue;

      const threshold = Math.ceil(
        Math.min(localTracks.length, externalAlbum.tracks.length) / 2,
      );
      const matched = matchLocalTracks(localTracks, externalAlbum.tracks);
      const matchCount = matched.filter((m) => m.mbTrack !== undefined).length;

      if (matchCount < threshold) continue;

      const albumResult = updateUnresolvedAlbum(album.albumId, {
        releaseGroupMbid: externalAlbum.releaseGroupMbid,
        canonicalTitle: externalAlbum.title,
      });

      if (albumResult.changes > 0) {
        void fetchAndStoreCoverArt(album.albumId, externalAlbum.releaseGroupMbid);
      }

      for (const { localId, mbTrack } of matched) {
        if (mbTrack) {
          updateTrackByTrackId(localId, {
            musicbrainzId: mbTrack.recordingMbid,
            canonicalTitle: mbTrack.title,
            resolutionStatus: "resolved",
          });
          progress.resolved++;
        }
      }

      if (externalAlbum.artistMbid) {
        resolveArtistMbid(
          album.artistId,
          externalAlbum.artistMbid,
          externalAlbum.artistName,
        );
      }

      break;
    }
  }
}
