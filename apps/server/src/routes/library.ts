import { FastifyPluginAsync } from "fastify";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePagination(query: { limit?: unknown; offset?: unknown }) {
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Number(query.offset) || 0;
  return { limit, offset };
}

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
};

export default libraryRoutes;
