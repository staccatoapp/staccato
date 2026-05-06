import {
  deleteAlbum,
  getAlbumIdByTitleAndArtistId,
  getAlbumsByArtistId,
  updateAlbumByAlbumId,
} from "../../db/queries/albums.js";
import {
  deleteArtist,
  getAllDuplicateArtists,
  getNonCanonicalDuplicateArtistIds,
} from "../../db/queries/artists.js";
import {
  updateTrackByAlbumId,
  updateTrackByArtistId,
} from "../../db/queries/tracks.js";

// Not sure why duplicates appear on rescans given normalized name comparison earlier in the pipeline, but deduping after is harmless.
export function dedupeArtistsAndAlbums(): void {
  const dupes = getAllDuplicateArtists();

  if (dupes.length === 0) return;

  for (const { musicbrainzId, canonicalId } of dupes) {
    const dupeArtistIds = getNonCanonicalDuplicateArtistIds(
      musicbrainzId,
      canonicalId,
    );

    for (const dupeArtistId of dupeArtistIds) {
      updateTrackByArtistId(dupeArtistId, { artistId: canonicalId });

      const dupeAlbums = getAlbumsByArtistId(dupeArtistId);

      for (const dupeAlbum of dupeAlbums) {
        const canonicalAlbumId = getAlbumIdByTitleAndArtistId(
          dupeAlbum.title,
          canonicalId,
        );

        if (canonicalAlbumId) {
          updateTrackByAlbumId(dupeAlbum.id, {
            albumId: canonicalAlbumId.id,
          });
          deleteAlbum(dupeAlbum.id);
        } else {
          updateAlbumByAlbumId(dupeAlbum.id, { artistId: canonicalId });
        }
      }

      deleteArtist(dupeArtistId);
    }
  }
}
