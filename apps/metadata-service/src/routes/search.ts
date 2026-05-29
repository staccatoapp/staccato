import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MetadataSearchResultsSchema } from "@staccato/shared";
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
import { fetchPopularity } from "../listenbrainz/popularity.js";
import { rankUnified } from "../search/rank.js";

const SEARCH_INC = "artist-credits+releases+release-groups+media";

// Best-effort fetch of one Solr index. Never rejects: on any failure it logs and
// returns null so one failing index doesn't sink the whole unified search.
async function fetchJson(
  path: string,
  label: string,
  log: FastifyBaseLogger,
): Promise<unknown | null> {
  try {
    const res = await mirrorFetch(path);
    if (!res.ok) {
      log.warn({ status: res.status, label }, "mirror search non-ok response");
      return null;
    }
    return await res.json();
  } catch (err) {
    log.warn({ err, label }, "mirror search failed");
    return null;
  }
}

// R3 · unified free-text search. One query fans out across the recording, artist,
// and release Solr indexes (via the `dismax` user-query parser), enriches each
// candidate with ListenBrainz popularity, and ranks them — sorting each section
// and selecting a cross-category top result. Serves /api/search/external.
const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/search", async (request, reply) => {
    const { q, limit } = z
      .object({ q: z.string().optional(), limit: z.string().optional() })
      .parse(request.query);
    if (!q || !q.trim()) {
      return reply.status(400).send({ error: "Missing query" });
    }
    const limitNum = Math.min(Math.max(Number(limit) || 10, 1), 25);
    const releaseFetchLimit = Math.min(limitNum * 3, 25);
    const query = q.trim();

    const recordingsPath = `/recording?${new URLSearchParams({
      query,
      dismax: "true",
      fmt: "json",
      limit: String(limitNum),
    })}&inc=${SEARCH_INC}`;
    const artistsPath = `/artist?${new URLSearchParams({
      query,
      dismax: "true",
      fmt: "json",
      limit: String(limitNum),
    })}`;
    const releasesPath = `/release?${new URLSearchParams({
      query,
      dismax: "true",
      fmt: "json",
      limit: String(releaseFetchLimit),
    })}&inc=artist-credits+release-groups`;

    const [recJson, artJson, relJson] = await Promise.all([
      fetchJson(recordingsPath, "recording", request.log),
      fetchJson(artistsPath, "artist", request.log),
      fetchJson(releasesPath, "release", request.log),
    ]);

    // Parse + map each index into ranking entries (DTO item + its Solr score).
    let recEntries: ReturnType<typeof mapRecordings> = [];
    if (recJson) {
      const parsed = RecordingSearchResponseSchema.safeParse(recJson);
      if (parsed.success) recEntries = mapRecordings(parsed.data.recordings);
      else
        request.log.error(
          { issues: parsed.error.issues },
          "recording search parse failed",
        );
    }
    let artEntries: ReturnType<typeof mapArtists> = [];
    if (artJson) {
      const parsed = ArtistSearchResponseSchema.safeParse(artJson);
      if (parsed.success) artEntries = mapArtists(parsed.data.artists);
      else
        request.log.error(
          { issues: parsed.error.issues },
          "artist search parse failed",
        );
    }
    let relEntries: ReturnType<typeof toMetadataSearchReleases> = [];
    if (relJson) {
      const parsed = ReleaseSearchResponseSchema.safeParse(relJson);
      if (parsed.success)
        relEntries = toMetadataSearchReleases(parsed.data.releases);
      else
        request.log.error(
          { issues: parsed.error.issues },
          "release search parse failed",
        );
    }

    // Popularity (ranking signal) — one batched ListenBrainz call per category,
    // concurrently. Releases key on their release-group. Degrades to nulls.
    const [recPop, artPop, rgPop] = await Promise.all([
      fetchPopularity(
        "recording",
        recEntries.map((e) => e.item.recordingMbid),
      ),
      fetchPopularity(
        "artist",
        artEntries.map((e) => e.item.artistMbid),
      ),
      fetchPopularity(
        "release-group",
        relEntries
          .map((e) => e.item.releaseGroupMbid)
          .filter((x): x is string => !!x),
      ),
    ]);
    for (const e of recEntries)
      e.item.listenCount = recPop.get(e.item.recordingMbid) ?? null;
    for (const e of artEntries)
      e.item.listenCount = artPop.get(e.item.artistMbid) ?? null;
    for (const e of relEntries)
      e.item.listenCount = e.item.releaseGroupMbid
        ? (rgPop.get(e.item.releaseGroupMbid) ?? null)
        : null;

    const ranked = rankUnified(query, {
      recordings: recEntries,
      artists: artEntries,
      releases: relEntries,
    });

    return MetadataSearchResultsSchema.parse({
      recordings: ranked.recordings.slice(0, limitNum),
      artists: ranked.artists.slice(0, limitNum),
      releases: ranked.releases.slice(0, limitNum),
      topResult: ranked.topResult,
    });
  });
};

function mapRecordings(
  raw: ReturnType<typeof RecordingSearchResponseSchema.parse>["recordings"],
) {
  return raw
    .filter((r) => r.video !== true)
    .map((r) => ({ item: toMetadataSearchRecording(r), lexScore: r.score }));
}

function mapArtists(
  raw: ReturnType<typeof ArtistSearchResponseSchema.parse>["artists"],
) {
  return raw.map((a) => ({
    item: toMetadataSearchArtist(a),
    lexScore: a.score ?? 0,
  }));
}

export default searchRoutes;
