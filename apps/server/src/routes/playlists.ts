import { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import {
  playlists,
  playlistTracks,
  tracks,
  albums,
  artists,
} from "../db/schema/index.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

type PlaylistRow = typeof playlists.$inferSelect;

function requireOwnPlaylist(
  playlistId: string,
  userId: string,
): PlaylistRow | 403 | 404 {
  const playlist = db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();
  if (!playlist) return 404;
  if (playlist.userId !== userId) return 403;
  return playlist;
}

const playlistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    const userId = req.userId;

    const userPlaylists = db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(desc(playlists.updatedAt))
      .all();

    if (userPlaylists.length === 0) return { items: [] };

    const playlistIds = userPlaylists.map((p) => p.id);

    const countRows = db
      .select({
        playlistId: playlistTracks.playlistId,
        trackCount: sql<number>`count(*)`,
      })
      .from(playlistTracks)
      .where(inArray(playlistTracks.playlistId, playlistIds))
      .groupBy(playlistTracks.playlistId)
      .all();

    const artRows = db
      .select({
        playlistId: playlistTracks.playlistId,
        coverArtUrl: albums.coverArtUrl,
        position: playlistTracks.position,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .innerJoin(albums, eq(tracks.albumId, albums.id))
      .where(inArray(playlistTracks.playlistId, playlistIds))
      .orderBy(asc(playlistTracks.position))
      .all();

    const countByPlaylist = new Map(
      countRows.map((r) => [r.playlistId, r.trackCount]),
    );
    const artByPlaylist = new Map<string, string | null>();
    for (const row of artRows) {
      if (!artByPlaylist.has(row.playlistId)) {
        artByPlaylist.set(row.playlistId, row.coverArtUrl);
      }
    }

    return {
      items: userPlaylists.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        trackCount: countByPlaylist.get(p.id) ?? 0,
        coverArtUrl: artByPlaylist.get(p.id) ?? null,
        updatedAt: p.updatedAt?.toISOString() ?? null,
      })),
    };
  });

  fastify.post("/", async (req, reply) => {
    const userId = req.userId;
    const { name, description } = z
      .object({ name: z.string().min(1), description: z.string().optional() })
      .parse(req.body);

    const now = new Date();
    const playlist = db
      .insert(playlists)
      .values({
        userId,
        name,
        description: description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return reply.status(201).send({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      trackCount: 0,
      coverArtUrl: null,
      updatedAt: playlist.updatedAt?.toISOString() ?? null,
    });
  });

  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    const trackRows = db
      .select({
        entryId: playlistTracks.id,
        trackId: tracks.id,
        title: sql<string>`COALESCE(${tracks.canonicalTitle}, ${tracks.title})`,
        artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
        albumTitle: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
        albumId: albums.id,
        coverArtUrl: albums.coverArtUrl,
        durationSeconds: tracks.durationSeconds,
        trackNumber: tracks.trackNumber,
        position: playlistTracks.position,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .innerJoin(albums, eq(tracks.albumId, albums.id))
      .innerJoin(artists, eq(tracks.artistId, artists.id))
      .where(eq(playlistTracks.playlistId, id))
      .orderBy(asc(playlistTracks.position))
      .all();

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      updatedAt: result.updatedAt?.toISOString() ?? null,
      tracks: trackRows,
    };
  });

  fastify.put("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    const { name, description } = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      })
      .parse(req.body);

    const updates: Partial<typeof playlists.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const updated = db
      .update(playlists)
      .set(updates)
      .where(eq(playlists.id, id))
      .returning()
      .get();

    return {
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      updatedAt: updated!.updatedAt?.toISOString() ?? null,
    };
  });

  fastify.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id)).run();
    db.delete(playlists).where(eq(playlists.id, id)).run();

    return reply.status(204).send();
  });

  fastify.post("/:id/tracks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    const { trackIds } = z
      .object({ trackIds: z.array(z.string()).min(1) })
      .parse(req.body);

    const maxPosRow = db
      .select({ maxPos: sql<number | null>`max(position)` })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, id))
      .get();

    const startPosition = (maxPosRow?.maxPos ?? -1) + 1;

    db.transaction(() => {
      trackIds.forEach((trackId, i) => {
        db.insert(playlistTracks)
          .values({ playlistId: id, trackId, position: startPosition + i })
          .run();
      });
      db.update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, id))
        .run();
    });

    return reply.status(204).send();
  });

  fastify.delete("/:id/tracks/:entryId", async (req, reply) => {
    const { id, entryId } = req.params as { id: string; entryId: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    const entry = db
      .select()
      .from(playlistTracks)
      .where(
        and(eq(playlistTracks.id, entryId), eq(playlistTracks.playlistId, id)),
      )
      .get();
    if (!entry)
      return reply.status(404).send({ error: "Track entry not found" });

    db.transaction(() => {
      db.delete(playlistTracks).where(eq(playlistTracks.id, entryId)).run();
      db.update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, id))
        .run();
    });

    return reply.status(204).send();
  });
};

export default playlistRoutes;
