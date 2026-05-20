import type { FastifyBaseLogger } from "fastify";
import { db } from "../db/client.js";
import {
  deleteOrphanAlbums,
  getAlbumById,
  updateAlbumByAlbumId,
} from "../db/queries/albums.js";
import {
  deleteOrphanArtists,
  getArtistDetails,
} from "../db/queries/artists.js";
import {
  getExistingTrackIds,
  getTracksInAlbum,
  updateTrackByTrackId,
} from "../db/queries/tracks.js";
import { upsertTrackFts } from "../db/queries/tracks-fts.js";
import { ensureCoverOnDisk } from "../coverart/store.js";
import {
  lookupReleaseDetails,
  MB_PRIORITY,
  type MBReleaseTrack,
} from "../musicbrainz/client.js";

export type IdentifyApplyResult =
  | {
      ok: true;
      albumId: string;
      releaseMbid: string;
      title: string;
      remapped: number;
      adopted: number;
      total: number;
    }
  | { ok: false; reason: "not_found" | "mb_lookup_failed" };

// Pair candidate tracks to local tracks by (disc, track) number so a remap
// only touches tracks that line up 1:1. Disc defaults to 1 (single-disc
// releases frequently omit the disc number locally).
function pairKey(disc: number | null, track: number | null): string {
  return `${disc ?? 1}:${track ?? 0}`;
}

// Manually re-link an album to a user-chosen MusicBrainz release and re-map its
// tracks to that release's recordings. Deterministic: writes exactly the
// release the user selected (no resolver re-search). Album metadata + paired
// track recording MBIDs/titles are updated in one transaction; cover art is
// refreshed afterwards. Extra/missing tracks are left untouched.
export async function applyAlbumIdentification(
  albumId: string,
  releaseMbid: string,
  releaseGroupMbidHint: string | null,
  adoptTrackIds: string[],
  log: FastifyBaseLogger,
): Promise<IdentifyApplyResult> {
  const album = getAlbumById(albumId);
  if (!album) {
    log.warn({ albumId }, "identify apply: album not found");
    return { ok: false, reason: "not_found" };
  }

  const details = await lookupReleaseDetails(
    releaseMbid,
    MB_PRIORITY.PAGE_LOAD,
  );
  if (!details) {
    log.warn(
      { albumId, releaseMbid },
      "identify apply: mb release lookup failed",
    );
    return { ok: false, reason: "mb_lookup_failed" };
  }

  const releaseGroupMbid = details.releaseGroupMbid ?? releaseGroupMbidHint;
  const title = details.releaseName ?? album.canonicalTitle ?? album.title;
  const artistName =
    details.artistName ?? getArtistDetails(album.artistId)?.name ?? "";

  // Only adopt ids that actually exist; ignore the rest defensively.
  const validAdopt =
    adoptTrackIds.length > 0 ? [...getExistingTrackIds(adoptTrackIds)] : [];

  const candidateByKey = new Map<string, MBReleaseTrack>();
  for (const t of details.tracks) {
    candidateByKey.set(pairKey(t.discPosition, t.trackPosition), t);
  }

  let remapped = 0;
  let adopted = 0;
  let total = 0;
  db.transaction(() => {
    updateAlbumByAlbumId(albumId, {
      releaseMbid,
      releaseGroupMbid,
      canonicalTitle: title,
      releaseYear: details.releaseYear ?? album.releaseYear,
      confidenceScore: 1.0,
    });

    // Pull orphan tracks onto this album + canonical artist BEFORE pairing, so
    // they participate in the (disc, track) remap below.
    for (const tid of validAdopt) {
      updateTrackByTrackId(tid, { albumId, artistId: album.artistId });
      adopted++;
    }

    const localTracks = getTracksInAlbum(albumId);
    total = localTracks.length;

    for (const local of localTracks) {
      const cand = candidateByKey.get(
        pairKey(local.discNumber, local.trackNumber),
      );
      if (!cand) continue; // extra/missing — leave the local track as-is
      updateTrackByTrackId(local.id, {
        musicbrainzId: cand.recordingMbid,
        canonicalTitle: cand.title,
        confidenceScore: 1.0,
        resolutionMethod: "manual",
        resolutionStatus: "resolved",
      });
      upsertTrackFts(local.id, cand.title, artistName, title);
      remapped++;
    }
  });

  // Adoption can empty the source album row (and orphan its phantom artist) —
  // drop them so a mistagged file no longer leaves a stray album/artist behind.
  if (adopted > 0) {
    deleteOrphanAlbums();
    deleteOrphanArtists();
  }

  log.info(
    {
      albumId,
      releaseMbid,
      releaseGroupMbid,
      remapped,
      adopted,
      total,
    },
    "album identify applied",
  );

  // Refresh cover art for the new release-group outside the transaction.
  if (releaseGroupMbid) {
    try {
      const cover = await ensureCoverOnDisk(
        releaseGroupMbid,
        MB_PRIORITY.PAGE_LOAD,
      );
      if (cover) {
        updateAlbumByAlbumId(albumId, { coverArtUrl: cover });
      }
    } catch (err) {
      log.warn(
        { err, albumId, releaseGroupMbid },
        "identify apply: cover art refresh failed",
      );
    }
  }

  return {
    ok: true,
    albumId,
    releaseMbid,
    title,
    remapped,
    adopted,
    total,
  };
}
