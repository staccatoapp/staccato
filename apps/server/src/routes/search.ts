import { FastifyPluginAsync } from "fastify";
import {
  lookupExternalAlbum,
  searchArtistsByQuery,
  searchRecordingsByQuery,
  searchReleasesByQuery,
} from "../musicbrainz/client.js";
import { db } from "../db/index.js";
import { tracks } from "../db/schema/index.js";
import { inArray } from "drizzle-orm";

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/external", async (request) => {
    const {
      type,
      recording,
      release,
      artist,
      limit: rawLimit,
    } = request.query as {
      type?: string;
      recording?: string;
      release?: string;
      artist?: string;
      limit?: string;
    };

    const limit = Math.min(Number(rawLimit) || 10, 25);

    if (type === "recording") {
      const parts: string[] = [];
      if (recording?.trim()) parts.push(`recording:"${recording.trim()}"`);
      if (release?.trim()) parts.push(`release:"${release.trim()}"`);
      if (artist?.trim()) parts.push(`artist:"${artist.trim()}"`);
      if (parts.length === 0)
        return { recordings: [], artists: [], releases: [] };

      const recordings = await searchRecordingsByQuery(
        parts.join(" AND "),
        limit,
      );
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
        artists: [],
        releases: [],
      };
    }

    if (type === "release") {
      const parts: string[] = [];
      if (release?.trim()) parts.push(`release:"${release.trim()}"`);
      if (artist?.trim()) parts.push(`artist:"${artist.trim()}"`);
      if (parts.length === 0)
        return { recordings: [], artists: [], releases: [] };

      const releases = await searchReleasesByQuery(parts.join(" AND "), limit);
      return { recordings: [], artists: [], releases };
    }

    if (type === "artist") {
      if (!artist?.trim()) return { recordings: [], artists: [], releases: [] };
      const artists = await searchArtistsByQuery(
        `artist:"${artist.trim()}"`,
        limit,
      );
      return { recordings: [], artists, releases: [] };
    }

    return { recordings: [], artists: [], releases: [] };
  });

  fastify.get("/external/albums/:rgMbid", async (request, reply) => {
    const { rgMbid } = request.params as { rgMbid: string };
    const album = await lookupExternalAlbum(rgMbid);
    if (!album) return reply.status(404).send({ error: "Not found" });
    return album;
  });
};

export default searchRoutes;
