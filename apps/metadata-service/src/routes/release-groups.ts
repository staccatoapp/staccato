import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MetadataAlbumDetailSchema } from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import {
  ReleaseGroupLookupSchema,
  ReleaseLookupSchema,
} from "../mirror/schemas.js";
import { toArtistCredits, toMetadataReleaseDetail } from "../mirror/map.js";
import { parseReleaseYear, pickBestRelease } from "../mirror/pickRelease.js";
import { MBID_RE } from "../lib/id-patterns.js";

// R6 · album detail + tracklist in one round-trip. Internally: release-group
// lookup → pickBestRelease → release lookup. Serves the server's
// lookupExternalAlbum (external album page).
const releaseGroupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/release-groups/:mbid", async (request, reply) => {
    const { mbid } = z.object({ mbid: z.string() }).parse(request.params);
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid release-group mbid" });
    }

    // Hop 1 — release-group lookup (releases + artist-credit).
    let rgRes: Response;
    try {
      rgRes = await mirrorFetch(
        `/release-group/${mbid}?inc=releases+artist-credits&fmt=json`,
      );
    } catch (err) {
      request.log.error({ err, mbid }, "mirror release-group fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }
    if (!rgRes.ok) {
      request.log.warn(
        { status: rgRes.status, mbid },
        "mirror release-group lookup non-ok response",
      );
      return reply
        .status(rgRes.status === 404 ? 404 : 502)
        .send({ error: "Upstream lookup failed" });
    }
    const rgParsed = ReleaseGroupLookupSchema.safeParse(await rgRes.json());
    if (!rgParsed.success) {
      request.log.error(
        { issues: rgParsed.error.issues, mbid },
        "mirror release-group parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    const rg = rgParsed.data;
    const releases = rg.releases ?? [];
    const releaseMbid = pickBestRelease(releases) ?? releases[0]?.id;
    if (!releaseMbid) {
      request.log.warn({ mbid }, "release-group has no releases");
      return reply.status(404).send({ error: "No release for release-group" });
    }
    const canonical = releases.find((r) => r.id === releaseMbid) ?? releases[0];

    // Hop 2 — chosen release detail (for the tracklist).
    let relRes: Response;
    try {
      relRes = await mirrorFetch(
        `/release/${releaseMbid}?inc=recordings+artist-credits+release-groups&fmt=json`,
      );
    } catch (err) {
      request.log.error(
        { err, mbid, releaseMbid },
        "mirror release fetch failed (release-group hop)",
      );
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }
    if (!relRes.ok) {
      request.log.warn(
        { status: relRes.status, mbid, releaseMbid },
        "mirror release lookup non-ok response (release-group hop)",
      );
      return reply.status(502).send({ error: "Upstream lookup failed" });
    }
    const relParsed = ReleaseLookupSchema.safeParse(await relRes.json());
    if (!relParsed.success) {
      request.log.error(
        { issues: relParsed.error.issues, mbid, releaseMbid },
        "mirror release parse failed (release-group hop)",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    const artist = rg["artist-credit"]?.[0]?.artist;
    return MetadataAlbumDetailSchema.parse({
      releaseGroupMbid: mbid,
      releaseMbid,
      title: rg.title,
      artistName: artist?.name ?? "Unknown Artist",
      artistMbid: artist?.id ?? null,
      releaseYear: parseReleaseYear(canonical?.date),
      releaseType: rg["primary-type"] ?? null,
      artistCredits: toArtistCredits(rg["artist-credit"]),
      tracks: toMetadataReleaseDetail(relParsed.data).tracks,
    });
  });
};

export default releaseGroupRoutes;
