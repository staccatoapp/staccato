import type { FastifyPluginAsync } from "fastify";
import { IdentifySearchResponseSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import { ReleaseSearchRichSchema } from "../mirror/schemas.js";
import { toIdentifyReleaseCandidate } from "../mirror/map.js";

const SEARCH_INC = "artist-credits+release-groups+media+labels";

// Strip embedded double-quotes so they can't break a quoted Lucene phrase.
function quotePhrase(value: string): string {
  return value.replace(/"/g, " ").trim();
}

// R5 · Identify-dialog release search. The façade owns the structured query
// build (release/artist/year → field-scoped Lucene) and returns every pressing
// (no release-group dedup) so the user can pick the one whose tracklist matches
// their files. Serves the server's searchReleasesForIdentify.
const releaseSearchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/releases/search", async (request, reply) => {
    const { release, artist, year, limit } = request.query as {
      release?: string;
      artist?: string;
      year?: string;
      limit?: string;
    };
    const limitNum = Math.min(Math.max(Number(limit) || 25, 1), 100);

    const clauses: string[] = [];
    const rel = quotePhrase(release ?? "");
    const art = quotePhrase(artist ?? "");
    const yr = year?.trim();
    if (rel) clauses.push(`release:"${rel}"`);
    if (art) clauses.push(`artist:"${art}"`);
    // `date:<year>` (NOT `date:<year>*`): the mirror's Solr returns nothing for a
    // prefix-wildcard on the date field but matches the bare year as a token
    // (covers full + partial dates like 1997 / 1997-06 / 1997-06-16). Only a
    // clean 4-digit year is applied — anything else is ignored (no Lucene
    // injection through the unquoted year clause, and a graceful no-op).
    if (yr && /^\d{4}$/.test(yr)) clauses.push(`date:${yr}`);
    if (clauses.length === 0) {
      return { results: [] };
    }
    const queryStr = clauses.join(" AND ");

    const params = new URLSearchParams({
      query: queryStr,
      fmt: "json",
      limit: String(limitNum),
    });

    let res: Response;
    try {
      res = await mirrorFetch(`/release?${params}&inc=${SEARCH_INC}`);
    } catch (err) {
      request.log.error(
        { err, query: queryStr },
        "mirror identify release search fetch failed",
      );
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }

    if (!res.ok) {
      request.log.warn(
        { status: res.status, query: queryStr },
        "mirror identify release search non-ok response",
      );
      return reply.status(502).send({ error: "Upstream search failed" });
    }

    const parsed = ReleaseSearchRichSchema.safeParse(await res.json());
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.issues, query: queryStr },
        "mirror identify release search parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    return IdentifySearchResponseSchema.parse({
      results: parsed.data.releases.map(toIdentifyReleaseCandidate),
    });
  });
};

export default releaseSearchRoutes;
