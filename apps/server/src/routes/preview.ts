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
  // Stream a 30s preview clip for a recording through the server, resolving the
  // upstream Deezer/iTunes URL on demand. Clients play this endpoint directly
  // (never a raw CDN URL) so a stale, time-limited upstream token is detected
  // here — on a non-OK upstream the cache entry is evicted and re-resolved.
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

    // Fast-path rejection on a trusted declared length, before we read the body.
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

    // Buffer the whole clip (small, capped at 10 MB) so we can serve it
    // range-aware. Native players (expo-audio → AVPlayer/ExoPlayer) need byte-
    // range support to build a seekable timeline and report progressing
    // currentTime — without it the preview plays but its progress bar is pinned
    // at 0. Mirrors the range-aware track stream route (routes/tracks.ts).
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_PREVIEW_BYTES) {
      req.log.warn(
        { recordingMbid, bytes: buf.length, maxBytes: MAX_PREVIEW_BYTES },
        "preview body exceeds size limit",
      );
      return reply.status(502).send({ error: "Preview fetch failed" });
    }

    const total = buf.length;
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "public, max-age=3600");

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr ?? "0", 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;

      // Reject an unsatisfiable or malformed range per RFC 7233. Reset the
      // content type (set to audio/mpeg above) so Fastify serialises the JSON
      // error body instead of rejecting an object under audio/mpeg.
      if (!Number.isFinite(start) || start > end || start >= total) {
        reply.header("Content-Range", `bytes */${total}`);
        reply.type("application/json");
        return reply.status(416).send({ error: "Range not satisfiable" });
      }

      const clampedEnd = Math.min(end, total - 1);
      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${clampedEnd}/${total}`);
      reply.header("Content-Length", clampedEnd - start + 1);
      return reply.send(buf.subarray(start, clampedEnd + 1));
    }

    reply.header("Content-Length", total);
    return reply.send(buf);
  });
};

export default previewRoutes;
