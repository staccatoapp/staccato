import { FastifyPluginAsync } from "fastify";
import {
  getAlbumByMbid,
  getAlbumWithArtistDetails,
} from "../db/queries/albums.js";
import { getTracksInAlbum } from "../db/queries/tracks.js";
import {
  ensureCoverOnDisk,
  resolveAlbumCoverNow,
} from "../coverart/store.js";
import { lookupExternalAlbum } from "../musicbrainz/client.js";

const CUID2_RE = /^[a-z0-9]{24}$/;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const albumRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/:albumKey", async (request, reply) => {
    const { albumKey } = request.params as { albumKey: string };

    const isCuid2 = CUID2_RE.test(albumKey);
    const isMbid = MBID_RE.test(albumKey);

    if (!isCuid2 && !isMbid) {
      request.log.warn({ albumKey }, "album lookup with unrecognised key");
      return reply.status(404).send({ error: "Album not found" });
    }

    const localRow = isCuid2
      ? getAlbumWithArtistDetails(albumKey)
      : getAlbumByMbid(albumKey);

    if (localRow) {
      const localTracks = getTracksInAlbum(localRow.id);
      return {
        source: "local" as const,
        album: {
          id: localRow.id,
          title: localRow.title,
          artistId: localRow.artistId,
          artistName: localRow.artistName,
          releaseYear: localRow.releaseYear,
          releaseGroupMbid: localRow.releaseGroupMbid,
          coverArtUrl: resolveAlbumCoverNow({
            albumId: localRow.id,
            releaseGroupMbid: localRow.releaseGroupMbid,
            coverArtUrl: localRow.coverArtUrl,
          }),
        },
        tracks: localTracks,
      };
    }

    if (!isMbid) {
      return reply.status(404).send({ error: "Album not found" });
    }

    const [external, coverArtUrl] = await Promise.all([
      lookupExternalAlbum(albumKey),
      ensureCoverOnDisk(albumKey),
    ]);
    if (!external) {
      request.log.warn({ albumKey }, "external album lookup returned nothing");
      return reply.status(404).send({ error: "Album not found" });
    }

    return {
      source: "external" as const,
      album: {
        releaseGroupMbid: external.releaseGroupMbid,
        releaseMbid: external.releaseMbid,
        title: external.title,
        artistName: external.artistName,
        artistMbid: external.artistMbid,
        releaseYear: external.releaseYear,
        releaseType: external.releaseType,
        coverArtUrl,
      },
      tracks: external.tracks,
    };
  });
};

export default albumRoutes;
