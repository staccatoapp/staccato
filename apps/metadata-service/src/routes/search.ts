import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import {
  MetadataSearchResultsSchema,
  type MetadataSearchArtist,
  type MetadataSearchRecording,
  type MetadataSearchRelease,
} from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import {
  ArtistSearchResponseSchema,
  RecordingSearchResponseSchema,
  ReleaseSearchResponseSchema,
} from "../mirror/schemas.js";
import {
  toMetadataSearchArtist,
  toMetadataSearchRecording,
  toMetadataSearchReleases,
} from "../mirror/map.js";

const SEARCH_INC = "artist-credits+releases+release-groups+media";

// Best-effort fetch + parse + map for one Solr index. Never rejects: on any
// failure it logs and returns [] so one failing index doesn't sink the whole
// unified search (mirrors R7's fetchReleaseGroups).
async function searchIndex<T>(
  path: string,
  parse: (json: unknown) => T[] | null,
  label: string,
  log: FastifyBaseLogger,
): Promise<T[]> {
  try {
    const res = await mirrorFetch(path);
    if (!res.ok) {
      log.warn({ status: res.status, label }, "mirror search non-ok response");
      return [];
    }
    const mapped = parse(await res.json());
    if (mapped === null) {
      log.error({ label }, "mirror search parse failed");
      return [];
    }
    return mapped;
  } catch (err) {
    log.warn({ err, label }, "mirror search failed");
    return [];
  }
}

// R3 · unified free-text search. One query fans out across the recording,
// artist, and release Solr indexes concurrently and returns all three
// categories. Serves the server's /api/search/external. Scoring/ordering is
// left to Solr's relevance; the server adds in-library/cover-art enrichment.
const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/search", async (request, reply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q || !q.trim()) {
      return reply.status(400).send({ error: "Missing query" });
    }
    const limitNum = Math.min(Math.max(Number(limit) || 10, 1), 25);
    const releaseFetchLimit = Math.min(limitNum * 3, 25);
    const query = q.trim();

    const recordingsPath = `/recording?${new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limitNum),
    })}&inc=${SEARCH_INC}`;
    const artistsPath = `/artist?${new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limitNum),
    })}`;
    const releasesPath = `/release?${new URLSearchParams({
      query,
      fmt: "json",
      limit: String(releaseFetchLimit),
    })}&inc=artist-credits+release-groups`;

    const [recordings, artists, releases] = await Promise.all([
      searchIndex<MetadataSearchRecording>(
        recordingsPath,
        (json) => {
          const parsed = RecordingSearchResponseSchema.safeParse(json);
          if (!parsed.success) return null;
          return parsed.data.recordings
            .filter((r) => r.video !== true)
            .map(toMetadataSearchRecording);
        },
        "recording",
        request.log,
      ),
      searchIndex<MetadataSearchArtist>(
        artistsPath,
        (json) => {
          const parsed = ArtistSearchResponseSchema.safeParse(json);
          if (!parsed.success) return null;
          return parsed.data.artists.map(toMetadataSearchArtist);
        },
        "artist",
        request.log,
      ),
      searchIndex<MetadataSearchRelease>(
        releasesPath,
        (json) => {
          const parsed = ReleaseSearchResponseSchema.safeParse(json);
          if (!parsed.success) return null;
          return toMetadataSearchReleases(parsed.data.releases).slice(
            0,
            limitNum,
          );
        },
        "release",
        request.log,
      ),
    ]);

    return MetadataSearchResultsSchema.parse({ recordings, artists, releases });
  });
};

export default searchRoutes;
