import { FastifyPluginAsync } from "fastify";
import {
  searchArtistsByQuery,
  searchRecordingsByQuery,
  searchReleasesByQuery,
} from "../musicbrainz/client.js";
import { db } from "../db/index.js";
import { tracks } from "../db/schema/index.js";
import { inArray } from "drizzle-orm";

// TODO - doing 3 passes for maximum matches is VERY slow. i think refactoring the UI to do separate searches for each category will be worth. also am considering tightening up the search - partial matches return a lot of junk the user probably isn't looking for
const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/external", async (request) => {
    const { q, limit: rawLimit } = request.query as {
      q?: string;
      limit?: string;
    };
    if (!q || q.trim().length < 2)
      return { recordings: [], artists: [], releases: [] };
    const limit = Math.min(Number(rawLimit) || 10, 25);

    const [recordings, artists, releases] = await Promise.all([
      searchRecordingsByQuery(q.trim(), limit),
      searchArtistsByQuery(q.trim(), 5),
      searchReleasesByQuery(q.trim(), 8),
    ]);

    const mbids = recordings.map((r) => r.recordingMbid);
    const localMbids = new Set(
      mbids.length > 0
        ? db
            .select({ musicbrainzId: tracks.musicbrainzId })
            .from(tracks)
            .where(inArray(tracks.musicbrainzId, mbids))
            .all()
            .map((r) => r.musicbrainzId)
        : [],
    );

    return {
      recordings: recordings.map((r) => ({
        ...r,
        inLibrary: localMbids.has(r.recordingMbid),
      })),
      artists,
      releases,
    };
  });
};

export default searchRoutes;
