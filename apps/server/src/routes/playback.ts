import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { playbackSession } from "../db/schema/playbackSession.js";
import { eq, inArray } from "drizzle-orm";
import { albums, artists, tracks } from "../db/schema/index.js";

const playbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/session", async (req) => {
    const userId = req.userId;
    const session = await getSessionWithTrackDetails(userId);
    return { session };
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
    return { session: updatedSession };
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
    return { session: updatedSession };
  });

  fastify.put("/session/state", async (req) => {
    const userId = req.userId;
    const { isPlaying, currentTrackIndex, currentTrackPositionInSeconds } = z
      .object({
        isPlaying: z.boolean(),
        currentTrackIndex: z.number(),
        currentTrackPositionInSeconds: z.number(),
      })
      .parse(req.body);

    await getOrCreateSession(userId);
    db.update(playbackSession)
      .set({ isPlaying, currentTrackIndex, currentTrackPositionInSeconds })
      .where(eq(playbackSession.userId, userId))
      .run();

    return { session: await getSessionWithTrackDetails(userId) };
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
          isPlaying: true,
        })
        .where(eq(playbackSession.userId, userId))
        .run();
    });

    return { session: await getSessionWithTrackDetails(userId) };
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
    isPlaying: session.isPlaying,
  };
}

export default playbackRoutes;
