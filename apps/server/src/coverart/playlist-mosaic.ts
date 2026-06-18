import { topFrequentKeys } from "@staccato/shared";
import { resolveAlbumCoverNow } from "./store.js";

/**
 * Build a mosaic of up to 4 cover arts for a playlist, ranked by how many tracks
 * share each album's cover (most-shared first). `rows` must be one row per track
 * in position order so first-seen order is the tiebreak; cover-less albums (null
 * resolve) are skipped so we keep walking the ranking until 4 renderable covers.
 */
export function buildPlaylistCoverMosaic(
  rows: {
    albumId: string;
    releaseGroupMbid: string | null;
    coverArtUrl: string | null;
  }[],
): string[] {
  const firstRowByAlbum = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!firstRowByAlbum.has(row.albumId))
      firstRowByAlbum.set(row.albumId, row);
  }
  const rankedAlbumIds = topFrequentKeys(rows.map((r) => r.albumId));
  const urls: string[] = [];
  for (const albumId of rankedAlbumIds) {
    const row = firstRowByAlbum.get(albumId)!;
    const url = resolveAlbumCoverNow({
      albumId: row.albumId,
      releaseGroupMbid: row.releaseGroupMbid,
      coverArtUrl: row.coverArtUrl,
    });
    if (url) urls.push(url);
    if (urls.length === 4) break;
  }
  return urls;
}
