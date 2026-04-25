import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolvePreview } from "../preview/index.js";

const previewRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/:recordingMbid/stream", async (req, reply) => {
    const { recordingMbid } = z
      .object({ recordingMbid: z.string() })
      .parse(req.params);
    const { artistName, trackTitle } = z
      .object({ artistName: z.string(), trackTitle: z.string() })
      .parse(req.query);

    const { previewUrl } = await resolvePreview(
      recordingMbid,
      artistName,
      trackTitle,
    );

    if (!previewUrl)
      return reply.status(404).send({ error: "No preview available" });

    const upstream = await fetch(previewUrl);
    if (!upstream.ok || !upstream.body) {
      return reply.status(502).send({ error: "Preview fetch failed" });
    }

    reply.header(
      "Content-Type",
      upstream.headers.get("content-type") ?? "audio/mpeg",
    );
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) reply.header("Content-Length", contentLength);
    reply.header("Cache-Control", "public, max-age=3600");

    return reply.send(upstream.body);
  });
};

export default previewRoutes;
