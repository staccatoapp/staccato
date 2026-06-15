import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolvePreview } from "../preview/index.js";
import { deleteCachedPreview } from "../db/queries/preview-cache.js";
import { isPublicHost } from "../lib/ssrf.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "preview-route" });

// 30-second clips at any realistic bitrate are well under 5 MB; 10 MB leaves
// ample headroom while still bounding abuse from a poisoned cache entry.
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

// Validate URL safety before fetching: https-only, public hostname, no redirects.
// Returns null (already logged) when any check fails.
async function guardedFetch(
  url: string,
  logContext: Record<string, unknown>,
): Promise<Response | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    log.warn({ ...logContext, url }, "preview url is not a valid URL");
    return null;
  }
  if (parsed.protocol !== "https:") {
    log.warn({ ...logContext, url }, "preview url rejected: non-https scheme");
    return null;
  }
  if (!(await isPublicHost(parsed.hostname, logContext))) {
    return null;
  }
  // redirect:"manual" surfaces 3xx as non-ok instead of following the redirect,
  // so a poisoned URL cannot bounce the fetch to an internal address after the
  // DNS check.
  return fetch(url, { redirect: "manual" });
}

const previewRoutes: FastifyPluginAsync = async (fastify) => {
  // Lazily resolve a 30s preview URL for a recording (used by search results,
  // which carry no inline previewUrl). Returns the absolute Deezer/iTunes URL
  // the client plays directly — same contract as recommended tracks' inline
  // previewUrl — or null when none is available.
  fastify.get("/:recordingMbid", async (req, reply) => {
    const { recordingMbid } = z
      .object({ recordingMbid: z.string() })
      .parse(req.params);
    const parsedQuery = z
      .object({ artistName: z.string(), trackTitle: z.string() })
      .safeParse(req.query);
    if (!parsedQuery.success) {
      req.log.warn(
        { err: parsedQuery.error, recordingMbid },
        "GET /:recordingMbid: missing artistName/trackTitle",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const { artistName, trackTitle } = parsedQuery.data;

    const { previewUrl } = await resolvePreview(
      recordingMbid,
      artistName,
      trackTitle,
    );
    if (!previewUrl) {
      req.log.debug(
        { recordingMbid, artistName, trackTitle },
        "no preview available for recording",
      );
    }
    return { previewUrl };
  });

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

    if (!previewUrl) {
      req.log.warn(
        { recordingMbid, artistName, trackTitle },
        "no preview available",
      );
      return reply.status(404).send({ error: "No preview available" });
    }

    let upstream: Response | null = await guardedFetch(previewUrl, {
      recordingMbid,
    });

    if (!upstream?.ok) {
      if (upstream) {
        req.log.warn(
          { recordingMbid, status: upstream.status, previewUrl },
          "cached preview url stale, refetching",
        );
      } else {
        req.log.warn(
          { recordingMbid },
          "cached preview url failed ssrf validation, clearing cache",
        );
      }
      deleteCachedPreview(recordingMbid);
      const fresh = await resolvePreview(recordingMbid, artistName, trackTitle);
      if (!fresh.previewUrl) {
        req.log.warn(
          { recordingMbid },
          "no preview available after cache miss",
        );
        return reply.status(404).send({ error: "No preview available" });
      }
      upstream = await guardedFetch(fresh.previewUrl, { recordingMbid });
    }

    if (!upstream?.ok || !upstream.body) {
      req.log.error(
        { recordingMbid, status: upstream?.status },
        "preview upstream fetch failed",
      );
      return reply.status(502).send({ error: "Preview fetch failed" });
    }

    const declaredLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PREVIEW_BYTES) {
      req.log.warn(
        {
          recordingMbid,
          contentLength: declaredLength,
          maxBytes: MAX_PREVIEW_BYTES,
        },
        "preview response exceeds size limit",
      );
      return reply.status(502).send({ error: "Preview fetch failed" });
    }

    reply.header("Content-Type", "audio/mpeg");
    if (Number.isFinite(declaredLength) && declaredLength > 0) {
      reply.header("Content-Length", declaredLength);
    }
    reply.header("Cache-Control", "public, max-age=3600");

    return reply.send(upstream.body);
  });
};

export default previewRoutes;
