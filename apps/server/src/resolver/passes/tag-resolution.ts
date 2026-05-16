import { lookupReleaseDetails } from "../../musicbrainz/client.js";
import { fetchAndStoreCoverArt, matchLocalTracks, resolveArtistMbid } from "../utils.js";
import {
  getAlbumsNeedingTagResolution,
  updateUnresolvedAlbum,
} from "../../db/queries/albums.js";
import {
  getPendingTracksWithFullMbidTags,
  getUnresolvedTracksByAlbum,
  updateTrackByTrackId,
} from "../../db/queries/tracks.js";
import { type ResolutionProgress } from "../types.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:tag-resolution" });

export async function runTagResolutionPass(progress: ResolutionProgress): Promise<void> {
  const fullyTaggedTracks = getPendingTracksWithFullMbidTags();
  for (const track of fullyTaggedTracks) {
    updateTrackByTrackId(track.id, { resolutionStatus: "resolved" });
    progress.resolved++;
  }
  if (fullyTaggedTracks.length > 0) {
    log.info(
      { count: fullyTaggedTracks.length },
      "picard fast-path resolved tracks from tags",
    );
  }

  const albums = getAlbumsNeedingTagResolution();

  if (albums.length === 0) return;
  log.info({ count: albums.length }, "tag resolution pass starting");

  for (const album of albums) {
    const details = await lookupReleaseDetails(album.releaseMbid!);
    if (!details || !details.releaseGroupMbid) continue;

    const albumResult = updateUnresolvedAlbum(album.albumId, {
      releaseGroupMbid: details.releaseGroupMbid,
      ...(details.releaseName ? { canonicalTitle: details.releaseName } : {}),
    });

    if (albumResult.changes > 0) {
      void fetchAndStoreCoverArt(album.albumId, details.releaseGroupMbid);
    }

    const localTracks = getUnresolvedTracksByAlbum(album.albumId);
    if (localTracks.length > 0) {
      const matched = matchLocalTracks(localTracks, details.tracks);
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
    }

    if (details.artistMbid) {
      resolveArtistMbid(album.artistId, details.artistMbid, details.artistName);
    }
  }
}
