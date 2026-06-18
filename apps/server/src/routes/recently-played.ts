import { FastifyPluginAsync } from "fastify";
import type {
  RecentlyPlayedItem,
  RecentlyPlayedResponse,
} from "@staccato/shared";
import { getRecentlyPlayedSources } from "../db/queries/listening-history.js";
import { getAlbumWithArtistDetails } from "../db/queries/albums.js";
import {
  getPlaylist,
  getPlaylistCoverArtUrls,
  getPlaylistTrackCounts,
} from "../db/queries/playlists.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import { buildPlaylistCoverMosaic } from "../coverart/playlist-mosaic.js";

const RESULT_LIMIT = 6;
// Over-fetch so sources that no longer resolve (e.g. a deleted or foreign
// playlist) can be backfilled from older plays without dropping below the limit.
const FETCH_LIMIT = 24;

const recentlyPlayedRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req): Promise<RecentlyPlayedResponse> => {
    const sources = getRecentlyPlayedSources(req.userId, FETCH_LIMIT);
    const items: RecentlyPlayedItem[] = [];

    for (const source of sources) {
      if (items.length >= RESULT_LIMIT) break;

      if (source.sourceType === "album") {
        const album = getAlbumWithArtistDetails(source.sourceId);
        if (!album) continue;
        items.push({
          kind: "album",
          id: album.id,
          title: album.title,
          artistName: album.artistName,
          releaseYear: album.releaseYear,
          coverArtUrl: resolveAlbumCoverNow({
            albumId: album.id,
            releaseGroupMbid: album.releaseGroupMbid,
            coverArtUrl: album.coverArtUrl,
          }),
          lastPlayedAt: source.lastListenedAtMs,
        });
      } else {
        const playlist = getPlaylist(source.sourceId);
        // Only the owner's in-library playlists are surfaced; foreign or
        // deleted playlists are skipped and backfilled by older sources.
        if (!playlist || playlist.userId !== req.userId) continue;
        const [countRow] = getPlaylistTrackCounts([playlist.id]);
        const coverRows = getPlaylistCoverArtUrls([playlist.id]);
        items.push({
          kind: "playlist",
          id: playlist.id,
          name: playlist.name,
          trackCount: countRow?.trackCount ?? 0,
          coverArtUrls: buildPlaylistCoverMosaic(coverRows),
          lastPlayedAt: source.lastListenedAtMs,
        });
      }
    }

    return { items };
  });
};

export default recentlyPlayedRoutes;
