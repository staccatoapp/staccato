import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parsePagination, UpdatePlaylistRequestSchema } from "@staccato/shared";
import {
  PlaylistRow,
  PlaylistUpdate,
  addTrackToPlaylist,
  countUserPlaylists,
  createPlaylist,
  deletePlaylist,
  deletePlaylistTracks,
  getMaxPlaylistTrackPosition,
  getPlaylist,
  getPlaylistCoverArtUrls,
  getPlaylistMemberships,
  getPlaylistTrackCounts,
  getPlaylistTrackEntry,
  getPlaylistTracks,
  getUserPlaylists,
  removePlaylistTrackEntry,
  touchPlaylist,
  updatePlaylist,
} from "../db/queries/playlists.js";
import { getExistingTrackIds } from "../db/queries/tracks.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";

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
  fastify.get("/", async (req, reply) => {
    const userId = req.userId;
    const parsedQuery = z
      .object({
        limit: z.string().optional(),
        offset: z.string().optional(),
        containsTrackId: z.string().optional(),
      })
      .safeParse(req.query);
    if (!parsedQuery.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { containsTrackId, ...paginationData } = parsedQuery.data;
    const paginationOptions = parsePagination(paginationData);

    const userPlaylists = getUserPlaylists(userId, paginationOptions);
    const total = countUserPlaylists(userId);

    if (userPlaylists.length === 0) return { items: [], total };

    const playlistIds = userPlaylists.map((p) => p.id);

    const countRows = getPlaylistTrackCounts(playlistIds);
    const artRows = getPlaylistCoverArtUrls(playlistIds);

    const countByPlaylist = new Map(
      countRows.map((r) => [r.playlistId, r.trackCount]),
    );
    const artByPlaylist = new Map<string, string | null>();
    for (const row of artRows) {
      if (!artByPlaylist.has(row.playlistId)) {
        artByPlaylist.set(
          row.playlistId,
          resolveAlbumCoverNow({
            albumId: row.albumId,
            releaseGroupMbid: row.releaseGroupMbid,
            coverArtUrl: row.coverArtUrl,
          }),
        );
      }
    }

    const membershipByPlaylist = containsTrackId
      ? getPlaylistMemberships(playlistIds, containsTrackId)
      : null;

    return {
      items: userPlaylists.map((p) => {
        const base = {
          id: p.id,
          name: p.name,
          description: p.description,
          trackCount: countByPlaylist.get(p.id) ?? 0,
          coverArtUrl: artByPlaylist.get(p.id) ?? null,
          updatedAt: p.updatedAt?.toISOString() ?? null,
        };
        if (membershipByPlaylist === null) return base;
        const entryId = membershipByPlaylist.get(p.id);
        return {
          ...base,
          isMember: entryId !== undefined,
          memberEntryId: entryId ?? null,
        };
      }),
      total,
    };
  });

  fastify.post("/", async (req, reply) => {
    const userId = req.userId;
    const parsedBody = z
      .object({ name: z.string().min(1), description: z.string().optional() })
      .safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn({ err: parsedBody.error }, "ROUTE: invalid request body");
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { name, description } = parsedBody.data;

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
      updatedAt: playlist.updatedAt?.toISOString() ?? null,
      tracks: [],
    });
  });

  fastify.get("/:id", async (req, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id } = parsedParams.data;
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404) {
      req.log.warn({ playlistId: id }, "playlist not found");
      return reply.status(404).send({ error: "Playlist not found" });
    }
    if (result === 403) {
      req.log.warn(
        { playlistId: id, userId: req.userId },
        "playlist access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    const trackRows = getPlaylistTracks(id);

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      updatedAt: result.updatedAt?.toISOString() ?? null,
      tracks: trackRows.map((t) => ({
        ...t,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: t.albumId,
          releaseGroupMbid: t.releaseGroupMbid,
          coverArtUrl: t.coverArtUrl,
        }),
      })),
    };
  });

  fastify.put("/:id", async (req, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id } = parsedParams.data;
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404) {
      req.log.warn({ playlistId: id }, "playlist not found");
      return reply.status(404).send({ error: "Playlist not found" });
    }
    if (result === 403) {
      req.log.warn(
        { playlistId: id, userId: req.userId },
        "playlist access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    const parsedBody = UpdatePlaylistRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn({ err: parsedBody.error }, "ROUTE: invalid request body");
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { name, description } = parsedBody.data;

    const updates: PlaylistUpdate = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const updated = updatePlaylist(id, updates);
    if (!updated) {
      req.log.warn({ playlistId: id }, "playlist disappeared before update");
      return reply.status(404).send({ error: "Playlist not found" });
    }

    const trackRows = getPlaylistTracks(id);
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt?.toISOString() ?? null,
      tracks: trackRows.map((t) => ({
        ...t,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: t.albumId,
          releaseGroupMbid: t.releaseGroupMbid,
          coverArtUrl: t.coverArtUrl,
        }),
      })),
    };
  });

  fastify.delete("/:id", async (req, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id } = parsedParams.data;
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404) {
      req.log.warn({ playlistId: id }, "playlist not found");
      return reply.status(404).send({ error: "Playlist not found" });
    }
    if (result === 403) {
      req.log.warn(
        { playlistId: id, userId: req.userId },
        "playlist access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    deletePlaylistTracks(id);
    deletePlaylist(id);

    return reply.status(204).send();
  });

  fastify.post("/:id/tracks", async (req, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id } = parsedParams.data;
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404) {
      req.log.warn({ playlistId: id }, "playlist not found");
      return reply.status(404).send({ error: "Playlist not found" });
    }
    if (result === 403) {
      req.log.warn(
        { playlistId: id, userId: req.userId },
        "playlist access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    const parsedBody = z
      .object({ trackIds: z.array(z.string()).min(1) })
      .safeParse(req.body);
    if (!parsedBody.success) {
      req.log.warn({ err: parsedBody.error }, "ROUTE: invalid request body");
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { trackIds } = parsedBody.data;

    const existingSet = getExistingTrackIds(trackIds);
    const validTrackIds = trackIds.filter((trackId) =>
      existingSet.has(trackId),
    );
    if (validTrackIds.length === 0) {
      return reply.status(400).send({ error: "no-valid-tracks" });
    }

    const startPosition = (getMaxPlaylistTrackPosition(id) ?? -1) + 1;

    validTrackIds.forEach((trackId, i) => {
      addTrackToPlaylist(id, trackId, startPosition + i);
    });
    touchPlaylist(id);

    return reply.status(204).send();
  });

  fastify.delete("/:id/tracks/:entryId", async (req, reply) => {
    const parsedParams = z
      .object({ id: z.string(), entryId: z.string() })
      .safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id, entryId } = parsedParams.data;
    const result = requireOwnPlaylist(id, req.userId);
    if (result === 404) {
      req.log.warn({ playlistId: id }, "playlist not found");
      return reply.status(404).send({ error: "Playlist not found" });
    }
    if (result === 403) {
      req.log.warn(
        { playlistId: id, userId: req.userId },
        "playlist access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    const entry = getPlaylistTrackEntry(entryId, id);
    if (!entry) {
      req.log.warn(
        { playlistId: id, entryId },
        "playlist track entry not found",
      );
      return reply.status(404).send({ error: "Track entry not found" });
    }

    removePlaylistTrackEntry(entryId);
    touchPlaylist(id);

    return reply.status(204).send();
  });
};

export default playlistRoutes;
