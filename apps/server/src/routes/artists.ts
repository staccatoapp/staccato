import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getArtistDetails, getArtistIdByMbid } from "../db/queries/artists.js";
import {
  getAppearsOnAlbumsByArtistId,
  getDiscographyAlbumsByArtistId,
  getReleaseCoCreditAlbumsByArtistId,
} from "../db/queries/albums.js";
import {
  ensureArtistImageOnDisk,
  resolveArtistImageNow,
} from "../artistimage/store.js";
import { lookupArtistDetail, MB_PRIORITY } from "../musicbrainz/client.js";
import { logger } from "../logger.js";
import { MBID_RE } from "../lib/id-patterns.js";
import { isCuid } from "@paralleldrive/cuid2";
import {
  dedupById,
  libraryItem,
  mergeDiscography,
  sortByYearDesc,
} from "../library/discography.js";

const artistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/:artistKey", async (request, reply) => {
    const { artistKey } = z
      .object({ artistKey: z.string() })
      .parse(request.params);

    const isCuid2 = isCuid(artistKey);
    const isMbid = MBID_RE.test(artistKey);

    if (!isCuid2 && !isMbid) {
      request.log.warn({ artistKey }, "artist lookup with unrecognised key");
      return reply.status(404).send({ error: "Artist not found" });
    }

    const localId = isCuid2 ? artistKey : getArtistIdByMbid(artistKey);
    const localRow = localId ? getArtistDetails(localId) : undefined;

    if (localRow) {
      logger.debug(`Local artist of ID ${localId} found`);
      const libraryAlbums = getDiscographyAlbumsByArtistId(localRow.id);
      const detail = localRow.musicbrainzId
        ? await lookupArtistDetail(
            localRow.musicbrainzId,
            MB_PRIORITY.PAGE_LOAD,
          )
        : null;
      const albums = mergeDiscography(
        detail?.releaseGroups ?? [],
        libraryAlbums,
      );

      // A collaborative album the artist co-owns now lands in Discography. Make
      // sure it can't also surface in Appears On via a track/guest credit.
      const discographyIds = new Set(libraryAlbums.map((a) => a.id));
      const appearsOnRows = dedupById([
        ...getAppearsOnAlbumsByArtistId(localRow.id),
        ...getReleaseCoCreditAlbumsByArtistId(localRow.id),
      ]).filter((row) => !discographyIds.has(row.id));

      return {
        source: "local" as const,
        artist: {
          id: localRow.id,
          name: localRow.name,
          musicbrainzId: localRow.musicbrainzId,
          imageUrl: resolveArtistImageNow({
            artistId: localRow.id,
            musicbrainzId: localRow.musicbrainzId,
            imageUrl: localRow.imageUrl,
          }),
        },
        albums,
        appearsOn: sortByYearDesc(appearsOnRows.map(libraryItem)),
      };
    }

    if (!isMbid) {
      return reply.status(404).send({ error: "Artist not found" });
    }

    logger.debug(
      `No local artist for MBID ${artistKey} found. Searching externally`,
    );

    const [detail, imageUrl] = await Promise.all([
      lookupArtistDetail(artistKey, MB_PRIORITY.PAGE_LOAD),
      ensureArtistImageOnDisk(artistKey, MB_PRIORITY.PAGE_LOAD),
    ]);

    if (!detail) {
      request.log.warn(
        { artistKey },
        "external artist lookup returned nothing",
      );
      return reply.status(404).send({ error: "Artist not found" });
    }

    const albums = mergeDiscography(detail.releaseGroups, []);

    return {
      source: "external" as const,
      artist: {
        artistMbid: detail.artist.artistMbid,
        name: detail.artist.name,
        disambiguation: detail.artist.disambiguation,
        imageUrl,
      },
      albums,
    };
  });
};

export default artistRoutes;
