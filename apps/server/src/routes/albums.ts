import path from "node:path";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AlbumEditRequestSchema,
  IdentifyApplyRequestSchema,
} from "@staccato/shared";
import {
  getAlbumById,
  getAlbumByMbid,
  getAlbumWithArtistDetails,
} from "../db/queries/albums.js";
import { applyAlbumEdit } from "../db/queries/album-edit.js";
import {
  getOrphanTracksInDirectories,
  getTrackFilePathsInAlbum,
  getTracksInAlbum,
} from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { listAlbumArtists } from "../db/queries/album-artists.js";
import {
  cacheCoverFromUrl,
  ensureCoverOnDisk,
  isLocalCoverUrl,
  resolveAlbumCoverNow,
} from "../coverart/store.js";
import {
  lookupExternalAlbum,
  lookupReleaseDetails,
  searchReleasesForIdentify,
  MB_PRIORITY,
} from "../musicbrainz/client.js";
import {
  applyAlbumIdentification,
  confirmAlbumMatch,
} from "../library/identify.js";
import { requireAdmin } from "../plugins/session.js";
import { MBID_RE } from "../lib/id-patterns.js";
import { isCuid } from "@paralleldrive/cuid2";

const IdentifySearchQuerySchema = z.object({
  release: z.string().optional().default(""),
  artist: z.string().optional().default(""),
  year: z.string().optional(),
});

const albumRoutes: FastifyPluginAsync = async (fastify) => {
  // Edit and Identify mutate shared library metadata, so they are admin-only.
  // Grouped under one requireAdmin preHandler (mirrors routes/admin/index.ts).
  // The public GET /:albumKey detail route stays outside this scope.
  await fastify.register(async (admin) => {
    admin.addHook("preHandler", requireAdmin);

    // ─── Identify Album: search MusicBrainz for the correct release ────────
    admin.get("/identify/search", async (request, reply) => {
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

    // ─── Identify Album: candidate release tracklist for comparison ────────
    admin.get("/identify/release/:releaseMbid", async (request, reply) => {
      const { releaseMbid } = z
        .object({ releaseMbid: z.string() })
        .parse(request.params);
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

    // ─── Identify Album: orphan tracks in the same folder, stranded elsewhere
    admin.get("/:albumId/identify/orphans", async (request, reply) => {
      const { albumId } = z
        .object({ albumId: z.string() })
        .parse(request.params);
      if (!isCuid(albumId)) {
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

    // ─── Identify Album: apply the chosen release to a local album ─────────
    admin.post("/:albumId/identify", async (request, reply) => {
      const { albumId } = z
        .object({ albumId: z.string() })
        .parse(request.params);
      if (!isCuid(albumId)) {
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

    // ─── Confirm Album Match: mark current automated match as accepted ─────
    admin.post("/:albumId/confirm-match", async (request, reply) => {
      const { albumId } = z
        .object({ albumId: z.string() })
        .parse(request.params);
      if (!isCuid(albumId)) {
        return reply.status(404).send({ error: "Album not found" });
      }
      const result = await confirmAlbumMatch(albumId, request.log);
      if (!result.ok) {
        return reply.status(404).send({ error: "Album not found" });
      }
      return result;
    });

    // ─── Edit Album: persist manual metadata/tracklist edits ───────────────
    // Overwrite model — edits write straight to the canonical rows with no
    // per-field lock. A later file re-tag / retry-resolution / sibling
    // re-resolve (library/commit.ts) or a re-identify (library/identify.ts) can
    // silently clobber these manual edits; protecting against that is a
    // deliberate follow-up (see edit-album Phase 2+ notes).
    admin.patch("/:albumId", async (request, reply) => {
      const { albumId } = request.params as { albumId: string };
      if (!isCuid(albumId)) {
        return reply.status(404).send({ error: "Album not found" });
      }
      const parsed = AlbumEditRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }
      const body = parsed.data;

      const album = getAlbumById(albumId);
      if (!album) {
        return reply.status(404).send({ error: "Album not found" });
      }

      // Resolve the cover before the (sync) transaction. An external https URL
      // is downloaded + cached so we persist a local /metadata/covers path, not
      // a raw third-party link. null clears the cover; an already-local path
      // passes through. On a failed download we keep the existing cover rather
      // than failing the whole edit.
      let coverArtUrl = body.coverArtUrl;
      if (coverArtUrl && !isLocalCoverUrl(coverArtUrl)) {
        const cached = await cacheCoverFromUrl(albumId, coverArtUrl);
        if (cached) {
          coverArtUrl = cached;
        } else {
          request.log.warn(
            { albumId, coverArtUrl },
            "cover art caching failed; keeping existing cover",
          );
          coverArtUrl = album.coverArtUrl;
        }
      }

      try {
        const counts = applyAlbumEdit(albumId, { ...body, coverArtUrl });
        request.log.info({ albumId, ...counts }, "album edit persisted");
        return { ok: true as const, albumId, ...counts };
      } catch (err) {
        request.log.error({ err, albumId }, "album edit failed");
        return reply.status(500).send({ error: "Album edit failed" });
      }
    });
  });

  fastify.get("/:albumKey", async (request, reply) => {
    const { albumKey } = z
      .object({ albumKey: z.string() })
      .parse(request.params);

    const isCuid2 = isCuid(albumKey);
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
      const creditsByTrack = groupCreditsByTrack(
        listTrackArtistsForTracks(localTracks.map((t) => t.id)),
      );
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
          confidenceScore: localRow.confidenceScore,
          pendingTrackCount: localRow.pendingTrackCount,
          artists: listAlbumArtists(localRow.id),
        },
        tracks: localTracks.map((t) => ({
          ...t,
          artists: creditsByTrack.get(t.id) ?? [],
        })),
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
        artists: external.artistCredits.map((c, i) => ({
          artistId: c.mbid,
          name: c.name,
          joinPhrase: c.joinPhrase,
          position: i,
        })),
      },
      tracks: external.tracks,
    };
  });
};

export default albumRoutes;
