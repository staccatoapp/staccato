import { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  appendToQueue,
  getOrCreatePlaybackSession,
  updatePlaybackSession,
  type PlaybackSessionRow,
} from "../db/queries/playback-session.js";
import {
  getExistingTrackIds,
  getPlaybackTracksByIds,
  getTrackForScrobble,
  type PlaybackTrackRow,
} from "../db/queries/tracks.js";
import {
  insertListenEvent,
  markScrobbled,
} from "../db/queries/listening-history.js";
import { getUserListenbrainzToken } from "../db/queries/settings.js";
import { submitListen } from "../listenbrainz/client.js";
import {
  getLyricsByTrackId,
  getTrackMetaForLyrics,
  insertLyrics,
} from "../db/queries/track-lyrics.js";
import { fetchLyrics, parseSyncedLyrics } from "../lyrics/client.js";
import type { TrackLyrics } from "@staccato/shared";

const playbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/session", async (req) => {
    const session = getOrCreatePlaybackSession(req.userId);
    return buildSessionResponse(session);
  });

  // TODO(queue-items): queue order via array index breaks when items insert
  // ahead of the current track. Switch to fractional indexing + a queue_items
  // table in a future plan.
  fastify.post("/session/queue", async (req, reply) => {
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    getOrCreatePlaybackSession(req.userId);
    const session = appendToQueue(req.userId, valid);
    return buildSessionResponse(session);
  });

  // TODO(queue-items): see comment on POST /session/queue.
  fastify.put("/session/queue", async (req, reply) => {
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0 && trackIds.length > 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    getOrCreatePlaybackSession(req.userId);
    const session = updatePlaybackSession(req.userId, { trackQueue: valid });
    return buildSessionResponse(session);
  });

  fastify.put("/session/state", async (req) => {
    const userId = req.userId;
    const {
      isPlaying,
      currentTrackIndex,
      currentTrackPositionInSeconds,
      currentTrackAccumulatedPlayTimeInSeconds,
      currentTrackListenEventCreated,
    } = z
      .object({
        isPlaying: z.boolean(),
        currentTrackIndex: z.number(),
        currentTrackPositionInSeconds: z.number(),
        currentTrackAccumulatedPlayTimeInSeconds: z.number(),
        currentTrackListenEventCreated: z.boolean().optional(),
      })
      .parse(req.body);

    const current = getOrCreatePlaybackSession(userId);
    const currentTrackId = current.trackQueue[currentTrackIndex];
    const currentTrackDurationSeconds = currentTrackId
      ? getTrackDurationSeconds(currentTrackId)
      : null;

    let listenEventCreated = current.currentTrackListenEventCreated;

    // only scrobble if listened to more than half the track or 4 mins as per
    // listenbrainz docs. should probably pull this out at some point
    if (
      !current.currentTrackListenEventCreated &&
      isPlaying &&
      currentTrackAccumulatedPlayTimeInSeconds >
        Math.min(240, (currentTrackDurationSeconds ?? 480) / 2)
    ) {
      if (currentTrackId) {
        addListenEvent(userId, currentTrackId, req.log).catch(() => {
          /* logged inside */
        });
      } else {
        req.log.warn(
          { userId, currentTrackIndex },
          "scrobble triggered but no track at currentTrackIndex",
        );
      }
      listenEventCreated = true;
    }

    const session = updatePlaybackSession(userId, {
      isPlaying,
      currentTrackIndex,
      currentTrackPositionInSeconds,
      currentTrackAccumulatedPlayTimeInSeconds,
      currentTrackListenEventCreated:
        currentTrackListenEventCreated ?? listenEventCreated,
    });

    return buildSessionResponse(session);
  });

  fastify.put("/session/play", async (req, reply) => {
    const { trackIds, startIndex } = z
      .object({
        trackIds: z.array(z.string()),
        startIndex: z.number(),
      })
      .parse(req.body);

    const valid = filterExistingTrackIds(trackIds);
    if (valid.length === 0) {
      return reply.code(400).send({ error: "no-valid-tracks" });
    }
    const safeStartIndex = Math.max(
      0,
      Math.min(startIndex, valid.length - 1),
    );

    getOrCreatePlaybackSession(req.userId);
    const session = updatePlaybackSession(req.userId, {
      trackQueue: valid,
      currentTrackIndex: safeStartIndex,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
      isPlaying: true,
    });

    return buildSessionResponse(session);
  });

  fastify.get("/lyrics", async (req, reply) => {
    const { trackId } = z.object({ trackId: z.string() }).parse(req.query);

    let row = getLyricsByTrackId(trackId);

    if (!row) {
      const meta = getTrackMetaForLyrics(trackId);
      if (!meta) return reply.status(204).send();

      const fetched = await fetchLyrics({
        artistName: meta.artistName,
        trackName: meta.trackTitle,
        albumName: meta.albumTitle ?? "",
        durationSeconds: meta.durationSeconds ?? 0,
      });

      row = insertLyrics({
        trackId,
        instrumental: fetched?.instrumental ?? false,
        plainLyrics: fetched?.plainLyrics ?? null,
        syncedLyrics: fetched?.syncedLyrics ?? null,
      });
    }

    if (row.instrumental || (!row.plainLyrics && !row.syncedLyrics)) {
      return reply.status(204).send();
    }

    const result: TrackLyrics = {
      trackId,
      instrumental: row.instrumental,
      plainLyrics: row.plainLyrics ?? null,
      syncedLyrics: row.syncedLyrics ? parseSyncedLyrics(row.syncedLyrics) : null,
    };

    return result;
  });
};

function filterExistingTrackIds(trackIds: string[]): string[] {
  const existing = getExistingTrackIds(trackIds);
  return trackIds.filter((id) => existing.has(id));
}

function getTrackDurationSeconds(trackId: string): number | null {
  const [track] = getPlaybackTracksByIds([trackId]);
  return track?.durationSeconds ?? null;
}

function orderTracksByQueue(
  queue: string[],
  tracks: PlaybackTrackRow[],
): PlaybackTrackRow[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return queue
    .map((id) => byId.get(id))
    .filter((t): t is PlaybackTrackRow => t !== undefined);
}

function buildSessionResponse(session: PlaybackSessionRow) {
  const sessionTracks = getPlaybackTracksByIds(session.trackQueue);
  const orderedTracks = orderTracksByQueue(session.trackQueue, sessionTracks);

  return {
    trackQueue: orderedTracks,
    currentTrackIndex: session.currentTrackIndex,
    currentTrackPositionInSeconds: session.currentTrackPositionInSeconds,
    currentTrackAccumulatedPlayTimeInSeconds:
      session.currentTrackAccumulatedPlayTimeInSeconds,
    currentTrackListenEventCreated: session.currentTrackListenEventCreated,
    isPlaying: session.isPlaying,
  };
}

// TODO: a periodic retry job should pick up listening_history rows with
// scrobbled_to_listenbrainz = false and replay them. Out of scope for now.
async function addListenEvent(
  userId: string,
  trackId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!trackId) return;

  const insertedListen = insertListenEvent(userId, trackId);

  const listenbrainzToken = getUserListenbrainzToken(userId);
  if (!listenbrainzToken) {
    log.warn(
      { userId },
      "could not submit listen to listenbrainz - no token found for user",
    );
    return;
  }

  const track = getTrackForScrobble(trackId);
  if (!track?.artistName || !track?.title) {
    log.warn(
      { trackId },
      "could not submit listen to listenbrainz - missing track or artist name",
    );
    return;
  }

  try {
    await submitListen({
      token: listenbrainzToken,
      listenType: "single",
      artistName: track.artistName,
      trackName: track.title,
      listenedAt: insertedListen.listenedAt,
      trackMbid: track.musicbrainzId,
    });
    markScrobbled(insertedListen.id);
  } catch (err) {
    log.error({ err, userId, trackId }, "scrobble to listenbrainz failed");
  }
}

export default playbackRoutes;
