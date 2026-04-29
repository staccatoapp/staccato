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
  getAlbumWithArtistDetails,
  searchAlbums,
} from "../db/queries/albums.js";
import {
  countTracks,
  getLibraryTracks,
  getTracksInAlbum,
} from "../db/queries/tracks.js";
import { db } from "../db/client.js";

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
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total,
    };
  });

  fastify.get("/albums/:albumId", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };

    const album = getAlbumWithArtistDetails(albumId);

    if (!album) return reply.status(404).send({ error: "Album not found" });

    const albumTracks = getTracksInAlbum(albumId);
    return {
      album: { ...album, createdAt: album.createdAt?.toISOString() ?? null },
      tracks: albumTracks,
    };
  });

  fastify.get("/tracks", async (request) => {
    const paginationOptions = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = getLibraryTracks(paginationOptions);
    const total = countTracks();

    return { items, total };
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
      duration_seconds: number | null;
      cover_art_url: string | null;
    }>;

    return {
      artists: artistResults,
      albums: albumResults.map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      tracks: trackRows.map((r) => ({
        id: r.id,
        title: r.title,
        artistName: r.artist_name,
        albumId: r.album_id,
        albumTitle: r.album_title,
        durationSeconds: r.duration_seconds,
        coverArtUrl: r.cover_art_url,
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
