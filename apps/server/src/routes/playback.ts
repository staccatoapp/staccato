import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getOrCreatePlaybackSession,
  updatePlaybackSession,
} from "../db/queries/playback-session.js";
import { getPlaybackTracksByIds, getTrackForScrobble } from "../db/queries/tracks.js";
import { insertListenEvent } from "../db/queries/listening-history.js";
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
    return getSessionWithTrackDetails(req.userId);
  });

  // TODO - relying on index for order is bad, e.g. if we are listening to 4th song and then add 2 songs before the queue. fractional indexing + separate table queue items would be better. refactor one day
  fastify.post("/session/queue", async (req) => {
    const userId = req.userId;
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    const session = getOrCreatePlaybackSession(userId);
    const updatedTrackQueue = session.trackQueue.concat(trackIds); // TODO - not atomic, doesn't validate trackIds, only appends. this will need work
    updatePlaybackSession(userId, { trackQueue: updatedTrackQueue });
    return getSessionWithTrackDetails(userId); // TODO - another round call for no good reason
  });

  // TODO - relying on index for order is bad, e.g. if we are listening to 4th song and then add 2 songs before the queue. fractional indexing + separate table queue items would be better. refactor one day
  fastify.put("/session/queue", async (req) => {
    const userId = req.userId;
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    updatePlaybackSession(userId, { trackQueue: Array.from(trackIds) });
    return getSessionWithTrackDetails(userId); // TODO - another round call for no good reason
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
        currentTrackListenEventCreated: z.boolean().optional(), // TODO - this is a band-aid for the fact that I forgot to add this field until after the fact. need to fix properly at some point
      })
      .parse(req.body);

    const currentSession = await getSessionWithTrackDetails(userId);

    let listenEventCreated = currentSession.currentTrackListenEventCreated;

    // only scrobble if listened to more than half the track or 4 mins as per listenbrainz docs. should probably pull this out at some point
    if (
      !currentSession.currentTrackListenEventCreated &&
      isPlaying &&
      currentTrackAccumulatedPlayTimeInSeconds >
        Math.min(
          240,
          (currentSession.trackQueue[currentTrackIndex]?.durationSeconds ??
            480) / 2,
        )
    ) {
      addListenEvent(
        userId,
        currentSession.trackQueue[currentTrackIndex]?.id ?? "",
      );
      listenEventCreated = true;
    }

    updatePlaybackSession(userId, {
      isPlaying,
      currentTrackIndex,
      currentTrackPositionInSeconds,
      currentTrackAccumulatedPlayTimeInSeconds,
      currentTrackListenEventCreated:
        currentTrackListenEventCreated ?? listenEventCreated,
    });

    return getSessionWithTrackDetails(userId); // TODO - can just return update result. whole area needs improvement and no performance issues rn so skipping until later
  });

  fastify.put("/session/play", async (req) => {
    const userId = req.userId;
    const { trackIds, startIndex } = z
      .object({
        trackIds: z.array(z.string()),
        startIndex: z.number(),
      })
      .parse(req.body);

    getOrCreatePlaybackSession(userId);
    updatePlaybackSession(userId, {
      trackQueue: trackIds,
      currentTrackIndex: startIndex,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
      isPlaying: true,
    });

    return getSessionWithTrackDetails(userId);
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

async function getSessionWithTrackDetails(userId: string) {
  const session = getOrCreatePlaybackSession(userId);
  const sessionTracks = getPlaybackTracksByIds(session.trackQueue);

  const orderedTracks = session.trackQueue
    .map((id) => sessionTracks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

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

// TODO - for now, scrobbling immediately into listenbrainz. In future, this will be handled by redis queues once I can be bothered
// also should probably be in a transaction/trycatch, and not querying so much separately. being lazy
async function addListenEvent(userId: string, trackId: string) {
  if (!trackId) return;

  const insertedListen = insertListenEvent(userId, trackId);

  const listenbrainzToken = getUserListenbrainzToken(userId);
  if (!listenbrainzToken) {
    console.warn(
      "Could not submit listen to ListenBrainz - no token found for user",
      userId,
    );
    return;
  }

  const track = getTrackForScrobble(trackId);

  if (!track?.artistName || !track?.title) {
    console.warn(
      "Could not submit listen to ListenBrainz - missing track or artist name for trackId",
      trackId,
    );
    return;
  }

  await submitListen({
    token: listenbrainzToken,
    listenType: "single",
    artistName: track.artistName,
    trackName: track.title,
    listenedAt: insertedListen.listenedAt,
    trackMbid: track.musicbrainzId,
  });
}

export default playbackRoutes;
