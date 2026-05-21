import type { FastifyPluginAsync } from "fastify";
import { MetadataRecordingSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import { RecordingRichSchema } from "../mirror/schemas.js";
import { toMetadataRecording } from "../mirror/map.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recordingRoutes: FastifyPluginAsync = async (fastify) => {
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
