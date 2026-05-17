import {
  type MBReleaseTrack,
  normalizeString,
} from "../musicbrainz/client.js";
import { ensureCoverOnDisk } from "../coverart/store.js";
import {
  getArtistIdByMbid,
  deleteArtist,
  updateArtist,
} from "../db/queries/artists.js";
import {
  updateAlbumByAlbumId,
  updateAlbumByArtistId,
} from "../db/queries/albums.js";
import { updateTrackByArtistId } from "../db/queries/tracks.js";

export function matchLocalTracks(
  localTracks: Array<{
    id: string;
    title: string;
    trackNumber: number | null;
    discNumber: number | null;
  }>,
  mbTracks: MBReleaseTrack[],
): Array<{ localId: string; mbTrack: MBReleaseTrack | undefined }> {
  return localTracks.map((local) => {
    let mbTrack: MBReleaseTrack | undefined;

    if (local.trackNumber !== null) {
      const disc = local.discNumber ?? 1;
      mbTrack = mbTracks.find(
        (t) => t.trackPosition === local.trackNumber && t.discPosition === disc,
      );
    }

    if (!mbTrack) {
      const norm = normalizeString(local.title);
      mbTrack = mbTracks.find((t) => normalizeString(t.title) === norm);
    }

    return { localId: local.id, mbTrack };
  });
}

export async function fetchAndStoreCoverArt(
  albumId: string,
  releaseGroupMbid: string | null | undefined,
): Promise<void> {
  if (!releaseGroupMbid) return;
  const localUrl = await ensureCoverOnDisk(releaseGroupMbid);
  updateAlbumByAlbumId(albumId, {
    releaseGroupMbid,
    ...(localUrl !== null ? { coverArtUrl: localUrl } : {}),
  });
}

export function resolveArtistMbid(
  localArtistId: string,
  mbArtistId: string,
  mbArtistName: string | null,
): void {
  const canonicalArtistId = getArtistIdByMbid(mbArtistId);

  if (canonicalArtistId && canonicalArtistId !== localArtistId) {
    updateTrackByArtistId(localArtistId, { artistId: canonicalArtistId });
    updateAlbumByArtistId(localArtistId, { artistId: canonicalArtistId });
    deleteArtist(localArtistId);
    if (mbArtistName) {
      updateArtist(canonicalArtistId, { canonicalName: mbArtistName });
    }
  } else if (!canonicalArtistId) {
    updateArtist(localArtistId, {
      musicbrainzId: mbArtistId,
      ...(mbArtistName ? { canonicalName: mbArtistName } : {}),
    });
  }
}
