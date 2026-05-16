import { searchRecording } from "../../musicbrainz/client.js";
import { fetchAndStoreCoverArt, resolveArtistMbid } from "../utils.js";
import { updateUnresolvedAlbum } from "../../db/queries/albums.js";
import {
  getUnresolvedTracksWithAlbumAndArtistDetails,
  updateTrackByTrackId,
} from "../../db/queries/tracks.js";
import { type ResolutionProgress } from "../types.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:recording-search-fallback" });

export async function runRecordingSearchFallback(progress: ResolutionProgress): Promise<void> {
  const unresolved = getUnresolvedTracksWithAlbumAndArtistDetails();

  log.info(
    { count: unresolved.length },
    "recording search fallback pass starting",
  );

  for (const track of unresolved) {
    const rawAlbumTitle = track.albumTitle ?? undefined;
    const hintAlbumTitle = rawAlbumTitle?.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const hint = hintAlbumTitle
      ? {
          albumTitle: hintAlbumTitle,
          releaseYear: track.releaseYear ?? undefined,
        }
      : undefined;

    const match = await searchRecording(track.artistName, track.title, hint);
    if (match) {
      updateTrackByTrackId(track.trackId, {
        musicbrainzId: match.recordingMbid,
        resolutionStatus: "resolved",
        ...(match.mbTrackTitle ? { canonicalTitle: match.mbTrackTitle } : {}),
      });
      if (match.releaseGroupMbid && track.albumId) {
        const albumResult = updateUnresolvedAlbum(track.albumId, {
          releaseGroupMbid: match.releaseGroupMbid,
        });
        if (albumResult.changes > 0) {
          void fetchAndStoreCoverArt(track.albumId, match.releaseGroupMbid);
        }
      }
      if (match.mbArtistId && track.artistId) {
        resolveArtistMbid(track.artistId, match.mbArtistId, match.mbArtistName);
      }
      progress.resolved++;
    } else {
      progress.failed++;
    }
  }
}
