import { fetchCoverArtUrlForGroup } from "../../coverart/client.js";
import {
  getResolvedAlbumsWithoutCoverArt,
  updateAlbumByAlbumId,
} from "../../db/queries/albums.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:cover-art-retry" });

export async function runCoverArtRetryPass(): Promise<void> {
  const needsRetry = getResolvedAlbumsWithoutCoverArt();

  if (needsRetry.length === 0) return;
  log.info({ count: needsRetry.length }, "cover art retry pass starting");

  for (const album of needsRetry) {
    if (!album.releaseGroupMbid) continue;
    const url = await fetchCoverArtUrlForGroup(album.releaseGroupMbid);
    if (url !== null && url !== "") {
      updateAlbumByAlbumId(album.albumId, { coverArtUrl: url });
    }
  }
}
