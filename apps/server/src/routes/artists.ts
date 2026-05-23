import { FastifyPluginAsync } from "fastify";
import type { ArtistDiscographyItem } from "@staccato/shared";
import { getArtistDetails, getArtistIdByMbid } from "../db/queries/artists.js";
import {
  getAppearsOnAlbumsByArtistId,
  getDiscographyAlbumsByArtistId,
  getReleaseCoCreditAlbumsByArtistId,
  type DiscographyAlbumRow,
} from "../db/queries/albums.js";
import {
  resolveAlbumCoverNow,
  resolveExternalCoverNow,
} from "../coverart/store.js";
import {
  ensureArtistImageOnDisk,
  resolveArtistImageNow,
} from "../artistimage/store.js";
import {
  lookupArtistDetail,
  MB_PRIORITY,
  type ArtistReleaseGroup,
} from "../musicbrainz/client.js";
import { logger } from "../logger.js";

const CUID2_RE = /^[a-z0-9]{24}$/;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISCOGRAPHY_PRIMARY_TYPES = new Set(["Album", "EP"]);

function isMainRelease(rg: ArtistReleaseGroup): boolean {
  if (!rg.primaryType || !DISCOGRAPHY_PRIMARY_TYPES.has(rg.primaryType)) {
    return false;
  }
  if (rg.secondaryTypes && rg.secondaryTypes.length > 0) return false;
  return true;
}

function parseYear(date: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function libraryItem(row: DiscographyAlbumRow): ArtistDiscographyItem {
  return {
    inLibrary: true,
    id: row.id,
    title: row.title,
    releaseYear: row.releaseYear,
    releaseGroupMbid: row.releaseGroupMbid,
    coverArtUrl: resolveAlbumCoverNow({
      albumId: row.id,
      releaseGroupMbid: row.releaseGroupMbid,
      coverArtUrl: row.coverArtUrl,
    }),
  };
}

function sortByYearDesc(
  items: ArtistDiscographyItem[],
): ArtistDiscographyItem[] {
  return [...items].sort((a, b) => {
    const ay = a.releaseYear ?? -Infinity;
    const by = b.releaseYear ?? -Infinity;
    return by - ay;
  });
}

function dedupById(rows: DiscographyAlbumRow[]): DiscographyAlbumRow[] {
  const byId = new Map<string, DiscographyAlbumRow>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()];
}

function mergeDiscography(
  releaseGroups: ArtistReleaseGroup[],
  libraryAlbums: DiscographyAlbumRow[],
): ArtistDiscographyItem[] {
  const libraryByMbid = new Map<string, DiscographyAlbumRow>();
  const libraryWithoutMbid: DiscographyAlbumRow[] = [];
  for (const album of libraryAlbums) {
    if (album.releaseGroupMbid) {
      libraryByMbid.set(album.releaseGroupMbid, album);
    } else {
      libraryWithoutMbid.push(album);
    }
  }

  const items: ArtistDiscographyItem[] = [];
  const seenMbids = new Set<string>();

  for (const rg of releaseGroups.filter(isMainRelease)) {
    seenMbids.add(rg.releaseGroupMbid);
    const local = libraryByMbid.get(rg.releaseGroupMbid);
    if (local) {
      items.push(libraryItem(local));
    } else {
      items.push({
        inLibrary: false,
        releaseGroupMbid: rg.releaseGroupMbid,
        title: rg.title,
        releaseYear: parseYear(rg.firstReleaseDate),
        coverArtUrl: resolveExternalCoverNow(rg.releaseGroupMbid),
      });
    }
  }

  // Library albums not covered by MB filter (no MBID, or MBID falls outside
  // Album/EP primary type) still belong in the artist's discography.
  for (const album of libraryWithoutMbid) items.push(libraryItem(album));
  for (const album of libraryAlbums) {
    if (album.releaseGroupMbid && !seenMbids.has(album.releaseGroupMbid)) {
      items.push(libraryItem(album));
    }
  }

  return sortByYearDesc(items);
}

const artistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/:artistKey", async (request, reply) => {
    const { artistKey } = request.params as { artistKey: string };

    const isCuid2 = CUID2_RE.test(artistKey);
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
        ? await lookupArtistDetail(localRow.musicbrainzId, MB_PRIORITY.PAGE_LOAD)
        : null;
      const albums = mergeDiscography(detail?.releaseGroups ?? [], libraryAlbums);

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
        appearsOn: sortByYearDesc(
          dedupById([
            ...getAppearsOnAlbumsByArtistId(localRow.id),
            ...getReleaseCoCreditAlbumsByArtistId(localRow.id),
          ]).map(libraryItem),
        ),
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
