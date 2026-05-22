import type { FastifyPluginAsync } from "fastify";
import {
  MetadataRecordingSchema,
  MetadataRecordingSearchResponseSchema,
} from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import {
  RecordingRichSchema,
  RecordingSearchResponseSchema,
} from "../mirror/schemas.js";
import {
  toMetadataRecording,
  toMetadataRecordingSearchResult,
} from "../mirror/map.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEARCH_INC = "artist-credits+releases+release-groups+media";

const recordingRoutes: FastifyPluginAsync = async (fastify) => {
  // R2 · resolver structured search. The query is an opaque Lucene string built
  // by the server's resolver (fromSearch.ts); the façade forwards it to Solr and
  // returns scored rich recordings. Scoring/thresholds stay server-side.
  // Registered before /recordings/:mbid for clarity — Fastify's radix router
  // matches the static "search" segment first regardless of order.
  fastify.get("/recordings/search", async (request, reply) => {
    const { query, limit } = request.query as {
      query?: string;
      limit?: string;
    };
    if (!query) {
      return reply.status(400).send({ error: "Missing query" });
    }
    const limitNum = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limitNum),
    });

    let res: Response;
    try {
      res = await mirrorFetch(`/recording?${params}&inc=${SEARCH_INC}`);
    } catch (err) {
      request.log.error({ err, query }, "mirror recording search fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }

    if (!res.ok) {
      request.log.warn(
        { status: res.status, query },
        "mirror recording search non-ok response",
      );
      return reply.status(502).send({ error: "Upstream search failed" });
    }

    const parsed = RecordingSearchResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.issues, query },
        "mirror recording search parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    return MetadataRecordingSearchResponseSchema.parse({
      recordings: parsed.data.recordings.map(toMetadataRecordingSearchResult),
    });
  });

  // Smoke lookup (3.0). Expanded into the full R1 in 3.1.
  fastify.get("/recordings/:mbid", async (request, reply) => {
    const { mbid } = request.params as { mbid: string };
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid recording mbid" });
    }

    let res: Response;
    try {
      res = await mirrorFetch(
        `/recording/${mbid}?inc=artist-credits+releases+release-groups+media&fmt=json`,
      );
    } catch (err) {
      request.log.error({ err, mbid }, "mirror recording fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }

    if (!res.ok) {
      request.log.warn(
        { status: res.status, mbid },
        "mirror recording lookup non-ok response",
      );
      return reply
        .status(res.status === 404 ? 404 : 502)
        .send({ error: "Upstream lookup failed" });
    }

    const parsed = RecordingRichSchema.safeParse(await res.json());
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.issues, mbid },
        "mirror recording parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    return MetadataRecordingSchema.parse(toMetadataRecording(parsed.data));
  });
};

export default recordingRoutes;
