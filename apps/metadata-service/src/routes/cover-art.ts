import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MIRROR_USER_AGENT } from "../constants.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAA_BASE = "https://coverartarchive.org";

// In-memory resolution cache: release-group mbid → resolved front-cover URL, or
// null (a "no-cover" sentinel). This is the primary defense for a SHARED service
// — repeat lookups across every Staccato deployment are served without
// re-hitting CAA. Deliberately NOT a p-queue: a fixed-concurrency upstream queue
// here would serialize all instances' requests through one global bottleneck.
// Global outbound protection is a Phase-5 infra-layer concern.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map<string, { url: string | null; expires: number }>();

// R9 · cover art. Mirrors CAA's front-cover redirect endpoint so one route
// serves both consumers: the server's download path (reads the redirect
// Location, then fetches the binary itself) and the browser's <img> src (follows
// the 302 to the image). 302 → cover found; 404 → no cover; 502 → upstream error.
const coverArtRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/cover-art/release-group/:mbid", async (request, reply) => {
    const { mbid } = z.object({ mbid: z.string() }).parse(request.params);
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid release-group mbid" });
    }

    const cached = cache.get(mbid);
    if (cached && cached.expires > Date.now()) {
      if (cached.url) return reply.redirect(cached.url, 302);
      return reply.status(404).send({ error: "No cover art" });
    }

    let res: Response;
    try {
      res = await fetch(`${CAA_BASE}/release-group/${mbid}/front`, {
        redirect: "manual",
        headers: { "User-Agent": MIRROR_USER_AGENT },
      });
    } catch (err) {
      request.log.error({ err, mbid }, "caa cover art fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }

    if (res.status === 302 || res.status === 307) {
      const location = res.headers.get("location");
      if (location) {
        cache.set(mbid, { url: location, expires: Date.now() + CACHE_TTL_MS });
        return reply.redirect(location, 302);
      }
      request.log.warn(
        { mbid, status: res.status },
        "caa redirect missing location",
      );
      return reply.status(502).send({ error: "Upstream redirect malformed" });
    }

    if (res.status === 404) {
      cache.set(mbid, { url: null, expires: Date.now() + CACHE_TTL_MS });
      return reply.status(404).send({ error: "No cover art" });
    }

    request.log.warn(
      { mbid, status: res.status },
      "caa cover art non-ok response",
    );
    return reply.status(502).send({ error: "Upstream lookup failed" });
  });
};

export default coverArtRoutes;
