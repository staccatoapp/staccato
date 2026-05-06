import { fetchCoverArtUrlForGroup } from "../../coverart/client.js";
import {
  getResolvedAlbumsWithoutCoverArt,
  updateAlbumByAlbumId,
} from "../../db/queries/albums.js";

export async function runCoverArtRetryPass(): Promise<void> {
  const needsRetry = getResolvedAlbumsWithoutCoverArt();

  if (needsRetry.length === 0) return;
  console.log(`[resolver] cover art retry: ${needsRetry.length} albums`);

  for (const album of needsRetry) {
    if (!album.releaseGroupMbid) continue;
    const url = await fetchCoverArtUrlForGroup(album.releaseGroupMbid);
    if (url !== null && url !== "") {
      updateAlbumByAlbumId(album.albumId, { coverArtUrl: url });
    }
  }
}
