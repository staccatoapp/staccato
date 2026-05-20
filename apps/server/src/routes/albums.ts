import path from "node:path";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { IdentifyApplyRequestSchema } from "@staccato/shared";
import {
  getAlbumByMbid,
  getAlbumWithArtistDetails,
} from "../db/queries/albums.js";
import {
  getOrphanTracksInDirectories,
  getTrackFilePathsInAlbum,
  getTracksInAlbum,
} from "../db/queries/tracks.js";
import {
  ensureCoverOnDisk,
  resolveAlbumCoverNow,
} from "../coverart/store.js";
import {
  lookupExternalAlbum,
  lookupReleaseDetails,
  searchReleasesForIdentify,
  MB_PRIORITY,
} from "../musicbrainz/client.js";
import { applyAlbumIdentification } from "../library/identify.js";

const CUID2_RE = /^[a-z0-9]{24}$/;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IdentifySearchQuerySchema = z.object({
  release: z.string().optional().default(""),
  artist: z.string().optional().default(""),
  year: z.string().optional(),
});

const albumRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Identify Album: search MusicBrainz for the correct release ──────────
  fastify.get("/identify/search", async (request, reply) => {
    const parsed = IdentifySearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid search query" });
    }
    const { release, artist, year } = parsed.data;
    if (!release.trim() && !artist.trim()) {
      return { results: [] };
    }
    const results = await searchReleasesForIdentify(
      { release, artist, year },
      25,
      MB_PRIORITY.INTERACTIVE,
    );
    return { results };
  });

  // ─── Identify Album: candidate release tracklist for comparison ──────────
  fastify.get("/identify/release/:releaseMbid", async (request, reply) => {
    const { releaseMbid } = request.params as { releaseMbid: string };
    if (!MBID_RE.test(releaseMbid)) {
      return reply.status(400).send({ error: "Invalid release id" });
    }
    const details = await lookupReleaseDetails(
      releaseMbid,
      MB_PRIORITY.PAGE_LOAD,
    );
    if (!details) {
      return reply.status(502).send({ error: "MusicBrainz lookup failed" });
    }
    return {
      tracks: details.tracks.map((t) => ({
        disc: t.discPosition,
        track: t.trackPosition,
        recordingMbid: t.recordingMbid,
        title: t.title,
        durationSeconds:
          t.durationMs == null ? null : Math.round(t.durationMs / 1000),
      })),
    };
  });

  // ─── Identify Album: orphan tracks in the same folder, stranded elsewhere ─
  fastify.get("/:albumId/identify/orphans", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    if (!CUID2_RE.test(albumId)) {
      return reply.status(404).send({ error: "Album not found" });
    }
    const filePaths = getTrackFilePathsInAlbum(albumId);
    const dirs = [
      ...new Set(filePaths.map((p) => path.dirname(p) + path.sep)),
    ];
    const orphans = getOrphanTracksInDirectories(dirs, albumId).map((o) => ({
      id: o.id,
      title: o.title,
      trackNumber: o.trackNumber,
      discNumber: o.discNumber,
      durationSeconds: o.durationSeconds,
      sourceAlbumId: o.sourceAlbumId,
      sourceAlbumTitle: o.sourceAlbumTitle,
      artistName: o.artistName,
    }));
    return { orphans };
  });

  // ─── Identify Album: apply the chosen release to a local album ───────────
  fastify.post("/:albumId/identify", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    if (!CUID2_RE.test(albumId)) {
      return reply.status(404).send({ error: "Album not found" });
    }
    const parsed = IdentifyApplyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }
    const result = await applyAlbumIdentification(
      albumId,
      parsed.data.releaseMbid,
      parsed.data.releaseGroupMbid,
      parsed.data.adoptTrackIds,
      request.log,
    );
    if (!result.ok) {
      if (result.reason === "not_found") {
        return reply.status(404).send({ error: "Album not found" });
      }
      return reply.status(502).send({ error: "MusicBrainz lookup failed" });
    }
    return result;
  });

  fastify.get("/:albumKey", async (request, reply) => {
    const { albumKey } = request.params as { albumKey: string };

    const isCuid2 = CUID2_RE.test(albumKey);
    const isMbid = MBID_RE.test(albumKey);

    if (!isCuid2 && !isMbid) {
      request.log.warn({ albumKey }, "album lookup with unrecognised key");
      return reply.status(404).send({ error: "Album not found" });
    }

    const localRow = isCuid2
      ? getAlbumWithArtistDetails(albumKey)
      : getAlbumByMbid(albumKey);

    if (localRow) {
      const localTracks = getTracksInAlbum(localRow.id);
      return {
        source: "local" as const,
        album: {
          id: localRow.id,
          title: localRow.title,
          artistId: localRow.artistId,
          artistName: localRow.artistName,
          releaseYear: localRow.releaseYear,
          releaseMbid: localRow.releaseMbid,
          releaseGroupMbid: localRow.releaseGroupMbid,
          coverArtUrl: resolveAlbumCoverNow({
            albumId: localRow.id,
            releaseGroupMbid: localRow.releaseGroupMbid,
            coverArtUrl: localRow.coverArtUrl,
          }),
        },
        tracks: localTracks,
      };
    }

    if (!isMbid) {
      return reply.status(404).send({ error: "Album not found" });
    }

    const [external, coverArtUrl] = await Promise.all([
      lookupExternalAlbum(albumKey, MB_PRIORITY.PAGE_LOAD),
      ensureCoverOnDisk(albumKey, MB_PRIORITY.PAGE_LOAD),
    ]);
    if (!external) {
      request.log.warn({ albumKey }, "external album lookup returned nothing");
      return reply.status(404).send({ error: "Album not found" });
    }

    return {
      source: "external" as const,
      album: {
        releaseGroupMbid: external.releaseGroupMbid,
        releaseMbid: external.releaseMbid,
        title: external.title,
        artistName: external.artistName,
        artistMbid: external.artistMbid,
        releaseYear: external.releaseYear,
        releaseType: external.releaseType,
        coverArtUrl,
      },
      tracks: external.tracks,
    };
  });
};

export default albumRoutes;
