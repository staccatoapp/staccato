import { FastifyPluginAsync } from "fastify";
import { eq, asc, sql, or, like } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists", async (request) => {
    const { limit, offset } = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = db
      .select({
        id: artists.id,
        name: artists.name,
        createdAt: artists.createdAt,
      })
      .from(artists)
      .orderBy(asc(artists.name))
      .limit(limit)
      .offset(offset)
      .all();

    const { total } = db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(artists)
      .get()!;

    return { items, total };
  });

  fastify.get("/albums", async (request) => {
    const { limit, offset } = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = db
      .select({
        id: albums.id,
        title: albums.title,
        artistId: albums.artistId,
        artistName: artists.name,
        releaseYear: albums.releaseYear,
        coverArtUrl: albums.coverArtUrl,
        createdAt: albums.createdAt,
      })
      .from(albums)
      .innerJoin(artists, eq(albums.artistId, artists.id))
      .orderBy(asc(artists.name), asc(albums.title))
      .limit(limit)
      .offset(offset)
      .all();

    const { total } = db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(albums)
      .get()!;

    return { items, total };
  });

  fastify.get("/albums/:albumId", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };

    const album = db
      .select({
        id: albums.id,
        title: albums.title,
        artistId: albums.artistId,
        artistName: artists.name,
        releaseYear: albums.releaseYear,
        coverArtUrl: albums.coverArtUrl,
        createdAt: albums.createdAt,
      })
      .from(albums)
      .innerJoin(artists, eq(albums.artistId, artists.id))
      .where(eq(albums.id, albumId))
      .get();

    if (!album) return reply.status(404).send({ error: "Album not found" });

    const albumTracks = db
      .select({
        id: tracks.id,
        title: tracks.title,
        trackNumber: tracks.trackNumber,
        discNumber: tracks.discNumber,
        durationSeconds: tracks.durationSeconds,
      })
      .from(tracks)
      .where(eq(tracks.albumId, albumId))
      .orderBy(asc(tracks.discNumber), asc(tracks.trackNumber))
      .all();

    return { album, tracks: albumTracks };
  });

  fastify.get("/tracks", async (request) => {
    const { limit, offset } = parsePagination(
      request.query as Record<string, unknown>,
    );

    const items = db
      .select({
        id: tracks.id,
        title: tracks.title,
        artistId: tracks.artistId,
        artistName: artists.name,
        albumId: tracks.albumId,
        albumTitle: albums.title,
        durationSeconds: tracks.durationSeconds,
        fileFormat: tracks.fileFormat,
      })
      .from(tracks)
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .leftJoin(albums, eq(tracks.albumId, albums.id))
      .orderBy(
        asc(artists.name),
        asc(albums.title),
        asc(tracks.discNumber),
        asc(tracks.trackNumber),
      )
      .limit(limit)
      .offset(offset)
      .all();

    const { total } = db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(tracks)
      .get()!;

    return { items, total };
  });

  fastify.get("/search", async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2)
      return { artists: [], albums: [], tracks: [] };
    const term = q.trim();
    const pattern = `%${term}%`;

    // Artists — LIKE on name
    const artistResults = db
      .select({ id: artists.id, name: artists.name })
      .from(artists)
      .where(like(artists.name, pattern))
      .limit(5)
      .all();

    // Albums — LIKE on album title or artist name
    const albumResults = db
      .select({
        id: albums.id,
        title: albums.title,
        artistId: albums.artistId,
        artistName: artists.name,
        releaseYear: albums.releaseYear,
        coverArtUrl: albums.coverArtUrl,
        createdAt: albums.createdAt,
      })
      .from(albums)
      .innerJoin(artists, eq(albums.artistId, artists.id))
      .where(or(like(albums.title, pattern), like(artists.name, pattern)))
      .limit(8)
      .all();

    // Tracks — FTS5 prefix match (tokenisation + relevance ranking)
    const ftsQuery = term.replace(/"/g, '""') + "*";
    const trackRows = db.all(sql`
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
  `) as Array<{
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

function parsePagination(query: { limit?: unknown; offset?: unknown }) {
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Number(query.offset) || 0;
  return { limit, offset };
}

export default libraryRoutes;
