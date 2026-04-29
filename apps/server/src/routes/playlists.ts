import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  PlaylistRow,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  deletePlaylistTracks,
  getMaxPlaylistTrackPosition,
  getPlaylist,
  getPlaylistCoverArtUrls,
  getPlaylistTrackCounts,
  getPlaylistTrackEntry,
  getPlaylistTracks,
  getUserPlaylists,
  removePlaylistTrackEntry,
  touchPlaylist,
  updatePlaylist,
} from "../db/queries/playlists.js";

function requireOwnPlaylist(
  playlistId: string,
  userId: string,
): PlaylistRow | 403 | 404 {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return 404;
  if (playlist.userId !== userId) return 403;
  return playlist;
}

const playlistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req) => {
    const userId = req.userId;

    const userPlaylists = getUserPlaylists(userId);

    if (userPlaylists.length === 0) return { items: [] };

    const playlistIds = userPlaylists.map((p) => p.id);

    const countRows = getPlaylistTrackCounts(playlistIds);
    const artRows = getPlaylistCoverArtUrls(playlistIds);

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
    const playlist = createPlaylist({
      userId,
      name,
      description: description ?? null,
      createdAt: now,
      updatedAt: now,
    });

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

    const trackRows = getPlaylistTracks(id);

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

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const updated = updatePlaylist(id, updates);

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

    deletePlaylistTracks(id);
    deletePlaylist(id);

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

    const startPosition = (getMaxPlaylistTrackPosition(id) ?? -1) + 1;

    trackIds.forEach((trackId, i) => {
      addTrackToPlaylist(id, trackId, startPosition + i);
    });
    touchPlaylist(id);

    return reply.status(204).send();
  });

  fastify.delete("/:id/tracks/:entryId", async (req, reply) => {
    const { id, entryId } = req.params as { id: string; entryId: string };
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404)
      return reply.status(404).send({ error: "Playlist not found" });
    if (result === 403) return reply.status(403).send({ error: "Forbidden" });

    const entry = getPlaylistTrackEntry(entryId, id);
    if (!entry)
      return reply.status(404).send({ error: "Track entry not found" });

    removePlaylistTrackEntry(entryId);
    touchPlaylist(id);

    return reply.status(204).send();
  });
};

export default playlistRoutes;
