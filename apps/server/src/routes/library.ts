import { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { parsePagination } from "@staccato/shared";
import {
  countArtists,
  getArtists,
  searchArtists,
} from "../db/queries/artists.js";
import {
  countAlbums,
  getAlbumsWithArtistDetails,
  searchAlbums,
} from "../db/queries/albums.js";
import { countTracks, getLibraryTracks } from "../db/queries/tracks.js";
import { db } from "../db/client.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import { resolveArtistImageNow } from "../artistimage/store.js";

const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists", async (request) => {
    const paginationOptions = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = getArtists(paginationOptions);
    const total = countArtists();

    return {
      items: items.map((r) => ({
        ...r,
        imageUrl: resolveArtistImageNow({
          artistId: r.id,
          musicbrainzId: r.musicbrainzId,
          imageUrl: r.imageUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total,
    };
  });

  fastify.get("/albums", async (request) => {
    const paginationOptions = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = getAlbumsWithArtistDetails(paginationOptions);
    const total = countAlbums();

    return {
      items: items.map((r) => ({
        ...r,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: r.id,
          releaseGroupMbid: r.releaseGroupMbid,
          coverArtUrl: r.coverArtUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total,
    };
  });

  fastify.get("/tracks", async (request) => {
    const paginationOptions = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = getLibraryTracks(paginationOptions);
    const total = countTracks();

    return {
      items: items.map((r) => ({
        ...r,
        coverArtUrl: r.albumId
          ? resolveAlbumCoverNow({
              albumId: r.albumId,
              releaseGroupMbid: r.releaseGroupMbid,
              coverArtUrl: r.coverArtUrl,
            })
          : r.coverArtUrl,
      })),
      total,
    };
  });

  fastify.get("/search", async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2)
      return { artists: [], albums: [], tracks: [] };
    const term = q.trim();
    const pattern = `%${term}%`;

    const artistResults = searchArtists(pattern, 5);
    const albumResults = searchAlbums(pattern, 8);

    // FTS5 prefix match — Drizzle doesn't support FTS, raw SQL stays inline
    const ftsQuery = buildTracksFtsQuery(term);
    const trackRows = db.all(
      ftsQuery
        ? sql`
            SELECT
              t.id,
              t.title,
              ar.name       AS artist_name,
              al.id         AS album_id,
              al.title      AS album_title,
              al.release_group_mbid AS release_group_mbid,
              t.duration_seconds,
              al.cover_art_url
            FROM tracks_fts f
            JOIN tracks  t  ON t.id  = f.track_id
            JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE tracks_fts MATCH ${ftsQuery}
            ORDER BY rank
            LIMIT 20
          `
        : sql`
            SELECT
              t.id,
              t.title,
              ar.name       AS artist_name,
              al.id         AS album_id,
              al.title      AS album_title,
              al.release_group_mbid AS release_group_mbid,
              t.duration_seconds,
              al.cover_art_url
            FROM tracks t
            JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE
              t.title LIKE ${pattern}
              OR ar.name LIKE ${pattern}
              OR al.title LIKE ${pattern}
            LIMIT 20
          `,
    ) as Array<{
      id: string;
      title: string;
      artist_name: string;
      album_id: string | null;
      album_title: string | null;
      release_group_mbid: string | null;
      duration_seconds: number | null;
      cover_art_url: string | null;
    }>;

    return {
      artists: artistResults.map((r) => ({
        ...r,
        imageUrl: resolveArtistImageNow({
          artistId: r.id,
          musicbrainzId: r.musicbrainzId,
          imageUrl: r.imageUrl,
        }),
      })),
      albums: albumResults.map((r) => ({
        ...r,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: r.id,
          releaseGroupMbid: r.releaseGroupMbid,
          coverArtUrl: r.coverArtUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      tracks: trackRows.map((r) => ({
        id: r.id,
        title: r.title,
        artistName: r.artist_name,
        albumId: r.album_id,
        albumTitle: r.album_title,
        durationSeconds: r.duration_seconds,
        coverArtUrl: r.album_id
          ? resolveAlbumCoverNow({
              albumId: r.album_id,
              releaseGroupMbid: r.release_group_mbid,
              coverArtUrl: r.cover_art_url,
            })
          : r.cover_art_url,
      })),
    };
  });
};

function buildTracksFtsQuery(term: string): string | null {
  const tokens = term.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token.toLowerCase()}*`).join(" AND ");
}

export default libraryRoutes;
