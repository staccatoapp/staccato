import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { playbackSession } from "../db/schema/playback-session.js";
import { eq, inArray } from "drizzle-orm";
import {
  albums,
  artists,
  listeningHistory,
  tracks,
  userSettings,
} from "../db/schema/index.js";
import { submitListen } from "../listenbrainz/client.js";

const playbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/session", async (req) => {
    const userId = req.userId;
    const session = await getSessionWithTrackDetails(userId);
    return session;
  });

  // TODO - relying on index for order is bad, e.g. if we are listening to 4th song and then add 2 songs before the queue. fractional indexing + separate table queue items would be better. refactor one day
  fastify.post("/session/queue", async (req, res) => {
    const userId = req.userId;
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    const session = await getOrCreateSession(userId);
    const updatedTrackQueue = session.trackQueue.concat(trackIds); // TODO - not atomic, doesn't validate trackIds, only appends. this will need work
    db.update(playbackSession)
      .set({ trackQueue: updatedTrackQueue })
      .where(eq(playbackSession.userId, userId))
      .run();

    const updatedSession = await getSessionWithTrackDetails(userId); // TODO - another round call for no good reason
    return updatedSession;
  });

  // TODO - relying on index for order is bad, e.g. if we are listening to 4th song and then add 2 songs before the queue. fractional indexing + separate table queue items would be better. refactor one day
  fastify.put("/session/queue", async (req, res) => {
    const userId = req.userId;
    const { trackIds } = z
      .object({ trackIds: z.array(z.string()) })
      .parse(req.body);
    const updatedTrackQueue = Array.from(trackIds);
    db.update(playbackSession)
      .set({ trackQueue: updatedTrackQueue })
      .where(eq(playbackSession.userId, userId))
      .run();

    const updatedSession = await getSessionWithTrackDetails(userId); // TODO - another round call for no good reason
    return updatedSession;
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
    }
    db.update(playbackSession)
      .set({
        isPlaying,
        currentTrackIndex,
        currentTrackPositionInSeconds,
        currentTrackAccumulatedPlayTimeInSeconds,
        currentTrackListenEventCreated:
          currentTrackListenEventCreated ??
          currentSession.currentTrackListenEventCreated,
      })
      .where(eq(playbackSession.userId, userId))
      .run();

    return await getSessionWithTrackDetails(userId); // TODO - can just return update result. whole area needs improvement and no performance issues rn so skipping until later
  });

  fastify.put("/session/play", async (req) => {
    const userId = req.userId;
    const { trackIds, startIndex } = z
      .object({
        trackIds: z.array(z.string()),
        startIndex: z.number(),
      })
      .parse(req.body);

    await getOrCreateSession(userId);
    db.transaction(() => {
      db.update(playbackSession)
        .set({
          trackQueue: trackIds,
          currentTrackIndex: startIndex,
          currentTrackPositionInSeconds: 0,
          currentTrackAccumulatedPlayTimeInSeconds: 0,
          currentTrackListenEventCreated: false,
          isPlaying: true,
        })
        .where(eq(playbackSession.userId, userId))
        .run();
    });

    return await getSessionWithTrackDetails(userId);
  });
};

// TODO - should probably split out db queries into a separate service
async function getOrCreateSession(userId: string) {
  return (
    db // TODO - should probably make all other db queries async instead of using get
      .insert(playbackSession)
      .values({
        userId,
        trackQueue: [],
      })
      // no op update - effectively a get-or-create
      .onConflictDoUpdate({
        target: playbackSession.userId,
        set: {
          userId,
        },
      })
      .returning()
      .get()
  );
}

async function getSessionWithTrackDetails(userId: string) {
  const session = await getOrCreateSession(userId);
  const sessionTracks =
    session.trackQueue.length === 0
      ? []
      : db
          .select({
            id: tracks.id,
            title: tracks.title,
            trackNumber: tracks.trackNumber,
            discNumber: tracks.discNumber,
            artistName: artists.name,
            coverArtUrl: albums.coverArtUrl,
            durationSeconds: tracks.durationSeconds,
          })
          .from(tracks)
          .innerJoin(albums, eq(tracks.albumId, albums.id))
          .innerJoin(artists, eq(tracks.artistId, artists.id))
          .where(inArray(tracks.id, session.trackQueue))
          .all();

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

  const insertedListen = db
    .insert(listeningHistory)
    .values({
      userId,
      trackId,
      scrobbledToListenbrainz: true,
    })
    .returning()
    .get();

  const currentUserSettings = db
    .select({ listenbrainzToken: userSettings.listenbrainzToken })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!currentUserSettings?.listenbrainzToken) {
    console.warn(
      "Could not submit listen to ListenBrainz - no token found for user",
      userId,
    );
    return;
  }

  const track = db
    .select({
      title: tracks.title,
      artistName: artists.name,
      trackMbid: tracks.musicbrainzId,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.id, trackId))
    .get();

  if (!track?.artistName || !track?.title) {
    console.warn(
      "Could not submit listen to ListenBrainz - missing track or artist name for trackId",
      trackId,
    );
    return;
  }

  await submitListen({
    token: currentUserSettings.listenbrainzToken,
    listenType: "single",
    artistName: track?.artistName,
    trackName: track?.title,
    listenedAt: insertedListen.listenedAt,
    trackMbid: track?.trackMbid,
  });

  db.update(playbackSession)
    .set({
      currentTrackListenEventCreated: true, // TODO: fix
    })
    .where(eq(playbackSession.userId, userId))
    .run();
}

export default playbackRoutes;
