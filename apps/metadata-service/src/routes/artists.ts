import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import {
  MetadataArtistDetailSchema,
  type MetadataArtistReleaseGroup,
} from "@staccato/shared";
import { mirrorFetch } from "../mirror/client.js";
import {
  ArtistLookupSchema,
  ArtistReleaseGroupsSchema,
} from "../mirror/schemas.js";
import {
  toMetadataArtist,
  toMetadataArtistReleaseGroups,
} from "../mirror/map.js";

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RG_PAGE_LIMIT = 100;
const RG_MAX_PAGES = 5;

// Best-effort paginated discography fetch (moved from the server's
// getArtistReleaseGroups). Never rejects: on any failure it returns whatever
// pages succeeded so the artist detail still renders.
async function fetchReleaseGroups(
  mbid: string,
  log: FastifyBaseLogger,
): Promise<MetadataArtistReleaseGroup[]> {
  const all: MetadataArtistReleaseGroup[] = [];
  try {
    for (let page = 0; page < RG_MAX_PAGES; page++) {
      const params = new URLSearchParams({
        artist: mbid,
        type: "album|ep",
        fmt: "json",
        limit: String(RG_PAGE_LIMIT),
        offset: String(page * RG_PAGE_LIMIT),
      });
      const res = await mirrorFetch(`/release-group?${params}`);
      if (!res.ok) {
        log.warn(
          { status: res.status, artistMbid: mbid, page },
          "mirror artist release-groups non-ok response",
        );
        break;
      }
      const parsed = ArtistReleaseGroupsSchema.safeParse(await res.json());
      if (!parsed.success) {
        log.error(
          { issues: parsed.error.issues, artistMbid: mbid, page },
          "mirror artist release-groups parse failed",
        );
        break;
      }
      all.push(...toMetadataArtistReleaseGroups(parsed.data));
      if (parsed.data["release-groups"].length < RG_PAGE_LIMIT) break;
    }
  } catch (err) {
    log.warn({ err, artistMbid: mbid }, "mirror artist release-groups failed");
  }
  return all;
}

// R7 · artist detail + discography, combined, one round-trip. Serves the
// server's lookupArtistDetail (external artist page + local-with-MBID
// discography). The discography fetch runs concurrently with the artist lookup.
const artistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists/:mbid", async (request, reply) => {
    const { mbid } = request.params as { mbid: string };
    if (!MBID_RE.test(mbid)) {
      return reply.status(400).send({ error: "Invalid artist mbid" });
    }

    // Kick off the (best-effort, never-rejecting) discography fetch alongside
    // the artist lookup.
    const releaseGroupsPromise = fetchReleaseGroups(mbid, request.log);

    let res: Response;
    try {
      res = await mirrorFetch(`/artist/${mbid}?fmt=json`);
    } catch (err) {
      request.log.error({ err, mbid }, "mirror artist fetch failed");
      return reply.status(502).send({ error: "Upstream fetch failed" });
    }
    if (!res.ok) {
      request.log.warn(
        { status: res.status, mbid },
        "mirror artist lookup non-ok response",
      );
      return reply
        .status(res.status === 404 ? 404 : 502)
        .send({ error: "Upstream lookup failed" });
    }
    const parsed = ArtistLookupSchema.safeParse(await res.json());
    if (!parsed.success) {
      request.log.error(
        { issues: parsed.error.issues, mbid },
        "mirror artist parse failed",
      );
      return reply.status(502).send({ error: "Upstream parse failed" });
    }

    const releaseGroups = await releaseGroupsPromise;
    return MetadataArtistDetailSchema.parse({
      artist: toMetadataArtist(parsed.data),
      releaseGroups,
    });
  });
};

export default artistRoutes;
