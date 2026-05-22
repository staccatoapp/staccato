import type { FastifyPluginAsync } from "fastify";
import { MetadataArtistImageSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// R8 · artist image. Owns the full 3-hop chain (moved from the server):
// MB url-rels (from the mirror) → Wikidata QID → Wikimedia Commons P18 filename.
// Returns the *base* Commons URL (Special:FilePath/<filename>, no `?width=`) +
// filename — the server keeps the disk cache and thumbnail-width sizing.
// 404 when any hop yields nothing; 502 on an upstream HTTP error.
const artistImageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists/:mbid/image", async (request, reply) => {
    const { mbid } = request.params as { mbid: string };
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid artist mbid" });
    }

    // Hop 1 — MB url-rels from the mirror (Postgres-backed; no Solr).
    let mbRes: Response;
    try {
      mbRes = await mirrorFetch(`/artist/${mbid}?inc=url-rels&fmt=json`);
    } catch (err) {
      request.log.error({ err, mbid }, "mirror artist url-rels fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }
    if (!mbRes.ok) {
      // Any 4xx (not-found / malformed MBID) → no image available (404). Only a
      // 5xx is a genuine upstream fault worth a 502.
      request.log.warn(
        { status: mbRes.status, mbid },
        "mirror artist url-rels non-ok response",
      );
      return reply
        .status(mbRes.status < 500 ? 404 : 502)
        .send({ error: "No image for artist" });
    }
    const mbData = (await mbRes.json()) as {
      relations?: Array<{ type: string; url: { resource: string } }>;
    };
    const wikidataRel = mbData.relations?.find((r) => r.type === "wikidata");
    const qid = wikidataRel?.url.resource.split("/wiki/")[1];
    if (!qid) {
      return reply.status(404).send({ error: "No Wikidata relation" });
    }

    // Hop 2 — Wikidata entity → P18 (image) claim. External; not the mirror.
    let wdRes: Response;
    try {
      wdRes = await fetch(
        `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      );
    } catch (err) {
      request.log.error({ err, mbid, qid }, "wikidata entity fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }
    if (!wdRes.ok) {
      // 4xx (entity missing) → no image (404); 5xx → upstream fault (502).
      request.log.warn(
        { status: wdRes.status, mbid, qid },
        "wikidata entity non-ok response",
      );
      return reply
        .status(wdRes.status < 500 ? 404 : 502)
        .send({ error: "No image for artist" });
    }
    const wdData = (await wdRes.json()) as {
      entities: Record<
        string,
        {
          claims?: {
            P18?: Array<{ mainsnak: { datavalue?: { value: string } } }>;
          };
        }
      >;
    };
    const filename =
      wdData.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) {
      return reply.status(404).send({ error: "No image for artist" });
    }

    // Hop 3 — base Commons URL. No `?width=` — the server appends sizing.
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      filename,
    )}`;
    return MetadataArtistImageSchema.parse({ url, filename });
  });
};

export default artistImageRoutes;
