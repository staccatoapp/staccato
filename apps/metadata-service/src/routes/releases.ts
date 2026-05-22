import type { FastifyPluginAsync } from "fastify";
import { MetadataReleaseDetailSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import { ReleaseLookupSchema } from "../mirror/schemas.js";
import { toMetadataReleaseDetail } from "../mirror/map.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// R4 · release + flattened tracklist. Postgres-backed; serves the server's
// lookupReleaseDetails (Identify dialog tracklist + apply remap).
const releaseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/releases/:mbid", async (request, reply) => {
    const { mbid } = request.params as { mbid: string };
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid release mbid" });
    }

    let res: Response;
    try {
      res = await mirrorFetch(
        `/release/${mbid}?inc=recordings+artist-credits+release-groups&fmt=json`,
      );
    } catch (err) {
      request.log.error({ err, mbid }, "mirror release fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }

    if (!res.ok) {
      request.log.warn(
        { status: res.status, mbid },
        "mirror release lookup non-ok response",
      );
      return reply
        .status(res.status === 404 ? 404 : 502)
        .send({ error: "Upstream lookup failed" });
    }

    const parsed = ReleaseLookupSchema.safeParse(await res.json());
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.issues, mbid },
        "mirror release parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    return MetadataReleaseDetailSchema.parse(
      toMetadataReleaseDetail(parsed.data),
    );
  });
};

export default releaseRoutes;
