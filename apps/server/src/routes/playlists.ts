import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  parsePagination,
  PlaylistSortSchema,
  RecommendedPlaylistTrackSchema,
  topFrequentKeys,
  UpdatePlaylistRequestSchema,
  type RecommendedPlaylistTrack,
} from "@staccato/shared";
import { serverConfig } from "../config/server-config.js";
import {
  getSuggestionRow,
  markSuggestionStale,
  upsertWarmingSuggestionRow,
} from "../db/queries/playlist-suggestions-cache.js";
import { refreshPlaylistTracksInLibrary } from "../recommendations/in-library.js";
import { DEBOUNCE_MS } from "../recommendations/playlist-suggestions/constants.js";
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
        sort: z.string().optional(),
      })
      .safeParse(req.query);
    if (!parsedQuery.success)
      return reply.status(400).send({ error: "Invalid request" });
    const paginationOptions = parsePagination(parsedQuery.data);
    const sort = PlaylistSortSchema.catch("createdAt").parse(
      parsedQuery.data.sort,
    );

    const userPlaylists = getUserPlaylists(userId, paginationOptions, sort);
    const total = countUserPlaylists(userId);

    if (userPlaylists.length === 0) return { items: [], total };

    const playlistIds = userPlaylists.map((p) => p.id);

    const countRows = getPlaylistTrackCounts(playlistIds);
    const artRows = getPlaylistCoverArtUrls(playlistIds);

    const countByPlaylist = new Map(
      countRows.map((r) => [r.playlistId, r.trackCount]),
    );

    // Build a mosaic of up to 4 cover arts per playlist, ranked by how many
    // tracks share each album's cover (most-shared first). artRows is one row
    // per track, ordered by position, so first-seen order is the tiebreak.
    type ArtRow = (typeof artRows)[number];
    const rowsByPlaylist = new Map<string, ArtRow[]>();
    for (const row of artRows) {
      const list = rowsByPlaylist.get(row.playlistId);
      if (list) list.push(row);
      else rowsByPlaylist.set(row.playlistId, [row]);
    }

    const coverArtUrlsByPlaylist = new Map<string, string[]>();
    for (const [playlistId, rows] of rowsByPlaylist) {
      const firstRowByAlbum = new Map<string, ArtRow>();
      for (const row of rows) {
        if (!firstRowByAlbum.has(row.albumId)) {
          firstRowByAlbum.set(row.albumId, row);
        }
      }
      const rankedAlbumIds = topFrequentKeys(rows.map((r) => r.albumId));
      const urls: string[] = [];
      for (const albumId of rankedAlbumIds) {
        const row = firstRowByAlbum.get(albumId)!;
        const url = resolveAlbumCoverNow({
          albumId: row.albumId,
          releaseGroupMbid: row.releaseGroupMbid,
          coverArtUrl: row.coverArtUrl,
        });
        // A cover-less album resolves to null and can't be rendered — skip it
        // and keep walking the ranking until we have 4 renderable covers.
        if (url) urls.push(url);
        if (urls.length === 4) break;
      }
      coverArtUrlsByPlaylist.set(playlistId, urls);
    }

    return {
      items: userPlaylists.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        trackCount: countByPlaylist.get(p.id) ?? 0,
        coverArtUrls: coverArtUrlsByPlaylist.get(p.id) ?? [],
        updatedAt: p.updatedAt?.toISOString() ?? null,
      })),
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

  fastify.get("/:id/suggestions", async (req, reply) => {
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
        "playlist suggestions access forbidden",
      );
      return reply.status(403).send({ error: "Forbidden" });
    }

    // Suggestions need the server-global Last.fm key (public reads). Without it
    // the feature is unavailable — return no-token (the UI hides the section)
    // rather than seeding rows that would only ever compute empty.
    if (!serverConfig.get().lastfm.apiKey) {
      return { status: "no-token" as const };
    }

    const row = getSuggestionRow(req.userId, id);
    if (!row) {
      upsertWarmingSuggestionRow(req.userId, id);
      return { status: "warming" as const };
    }
    if (row.status === "warming" && !row.payload) {
      return { status: "warming" as const };
    }

    let tracks: RecommendedPlaylistTrack[] = [];
    if (row.payload) {
      // safeParse guards the schema shape; JSON.parse can still throw on a
      // corrupt row, so guard it and treat a bad payload as empty.
      try {
        const parsed = z
          .array(RecommendedPlaylistTrackSchema)
          .safeParse(JSON.parse(row.payload));
        if (parsed.success) {
          tracks = parsed.data;
        } else {
          req.log.warn(
            { playlistId: id, errors: parsed.error.issues },
            "playlist suggestions payload failed validation; treating as empty",
          );
        }
      } catch (err) {
        req.log.warn(
          { err, playlistId: id },
          "playlist suggestions payload not parseable JSON; treating as empty",
        );
      }
    }

    const live = refreshPlaylistTracksInLibrary(tracks);
    if (row.status === "error") {
      return { status: "error" as const, data: live.length ? live : null };
    }
    return { status: "ready" as const, data: live };
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
    markSuggestionStale(req.userId, id, Date.now() + DEBOUNCE_MS);

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
    markSuggestionStale(req.userId, id, Date.now() + DEBOUNCE_MS);

    return reply.status(204).send();
  });
};

export default playlistRoutes;
