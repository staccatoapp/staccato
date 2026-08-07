import type { FastifyPluginAsync } from "fastify";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import { MetadataArtistImageSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import { MBID_RE } from "../lib/id-patterns.js";

export const ArtistUrlRelsSchema = z.object({
  relations: z
    .array(
      z.object({
        type: z.string(),
        url: z.object({ resource: z.string() }),
      }),
    )
    .optional(),
});

export const WikidataEntitySchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      claims: z
        .object({
          P18: z
            .array(
              z.object({
                mainsnak: z.object({
                  datavalue: z.object({ value: z.string() }).optional(),
                }),
              }),
            )
            .optional(),
        })
        .optional(),
    }),
  ),
});

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
type CacheValue = { url: string; filename: string } | null;
// lru-cache v11 prohibits null values; wrap so the null sentinel is storable.
export const cache = new LRUCache<string, { value: CacheValue }>({
  max: 10_000,
  ttl: CACHE_TTL_MS,
  ttlResolution: 0,
  perf: { now: () => Date.now() },
});

// R8 · artist image. Owns the full 3-hop chain (moved from the server):
// MB url-rels (from the mirror) → Wikidata QID → Wikimedia Commons P18 filename.
// Returns the *base* Commons URL (Special:FilePath/<filename>, no `?width=`) +
// filename — the server keeps the disk cache and thumbnail-width sizing.
// 404 when any hop yields nothing; 502 on an upstream HTTP error.
const artistImageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists/:mbid/image", async (request, reply) => {
    const { mbid } = z.object({ mbid: z.string() }).parse(request.params);
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid artist mbid" });
    }

    const cached = cache.get(mbid);
    if (cached !== undefined) {
      if (cached.value) return MetadataArtistImageSchema.parse(cached.value);
      return reply.status(404).send({ error: "No image for artist" });
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
      if (mbRes.status < 500) {
        cache.set(mbid, { value: null });
      }
      return reply
        .status(mbRes.status < 500 ? 404 : 502)
        .send({ error: "No image for artist" });
    }
    const mbParsed = ArtistUrlRelsSchema.safeParse(await mbRes.json());
    if (!mbParsed.success) {
      request.log.warn(
        { err: mbParsed.error, mbid },
        "mb artist url-rels response failed schema validation",
      );
      return reply.status(404).send({ error: "No image for artist" });
    }
    const wikidataRel = mbParsed.data.relations?.find(
      (r) => r.type === "wikidata",
    );
    const qid = wikidataRel?.url.resource.split("/wiki/")[1];
    if (!qid) {
      cache.set(mbid, { value: null });
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
      if (wdRes.status < 500) {
        cache.set(mbid, { value: null });
      }
      return reply
        .status(wdRes.status < 500 ? 404 : 502)
        .send({ error: "No image for artist" });
    }
    const wdParsed = WikidataEntitySchema.safeParse(await wdRes.json());
    if (!wdParsed.success) {
      request.log.warn(
        { err: wdParsed.error, mbid, qid },
        "wikidata entity response failed schema validation",
      );
      return reply.status(404).send({ error: "No image for artist" });
    }
    const filename =
      wdParsed.data.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) {
      cache.set(mbid, { value: null });
      return reply.status(404).send({ error: "No image for artist" });
    }

    // Hop 3 — base Commons URL. No `?width=` — the server appends sizing.
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      filename,
    )}`;
    cache.set(mbid, { value: { url, filename } });
    return MetadataArtistImageSchema.parse({ url, filename });
  });
};

export default artistImageRoutes;
