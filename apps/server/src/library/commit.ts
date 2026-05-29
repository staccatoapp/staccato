import { logger } from "../logger.js";
import { db } from "../db/client.js";
import {
  deleteAlbum,
  findAlbumByReleaseMbid,
  getAlbumById,
  updateAlbumByAlbumId,
} from "../db/queries/albums.js";
import {
  getArtistIdByMbid,
  getArtistRowById,
  updateArtist,
  upsertArtist,
} from "../db/queries/artists.js";
import {
  getDominantArtistIdForAlbum,
  markTrackResolved,
  updateTrackByAlbumId,
  updateTrackByTrackId,
} from "../db/queries/tracks.js";
import { computePrimaryFlags } from "@staccato/shared";
import {
  normalizeString,
  lookupReleaseDetails,
  MB_PRIORITY,
} from "../musicbrainz/client.js";
import { upsertTrackFts } from "../db/queries/tracks-fts.js";
import { replaceTrackArtists } from "../db/queries/track-artists.js";
import { replaceAlbumArtists } from "../db/queries/album-artists.js";
import { ensureCoverOnDisk } from "../coverart/store.js";
import { ensureArtistImageOnDisk } from "../artistimage/store.js";
import type { ScoredCandidate, ResolvedRelease, RawTags } from "./types.js";
import { AUTO_COMMIT_THRESHOLD } from "./scoring.js";

const log = logger.child({ module: "library:commit" });

// Release-detail fetch is per-track, but album_artists only needs writing once
// per (album, release). Dedup the deferred fetch so a bulk scan of an N-track
// album makes one facade call, not N. Replace-on-write keeps it order-independent.
const albumArtistsInflight = new Map<string, Promise<void>>();

async function populateAlbumArtists(
  releaseMbid: string,
  albumId: string,
): Promise<void> {
  const key = `${albumId}:${releaseMbid}`;
  const existing = albumArtistsInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const details = await lookupReleaseDetails(
        releaseMbid,
        MB_PRIORITY.BACKGROUND,
      );
      if (!details || details.artistCredits.length === 0) {
        log.debug(
          { releaseMbid, albumId },
          "skipping album_artists population: no release artist credits",
        );
        return;
      }
      const primaryFlags = computePrimaryFlags(
        details.artistCredits.map((c) => c.joinPhrase),
      );
      const credits = details.artistCredits.map((c, idx) => ({
        artistId: ensureArtistByMbid(c.mbid, c.name),
        position: idx,
        joinPhrase: c.joinPhrase,
        isPrimary: primaryFlags[idx] ?? true,
      }));
      replaceAlbumArtists(albumId, credits);
    } catch (err) {
      log.warn({ err, releaseMbid, albumId }, "album artist population failed");
    } finally {
      albumArtistsInflight.delete(key);
    }
  })();

  albumArtistsInflight.set(key, promise);
  return promise;
}

interface CommitInput {
  trackId: string;
  currentArtistId: string;
  currentAlbumId: string | null;
  winner: ScoredCandidate;
  release: ResolvedRelease | null;
  tags: RawTags;
  audioFingerprint: string | null;
}

// Resolve the artist row for a recording's lead credit (mbid, name) by
// MBID-keyed find-or-create. Identity-stable: an existing row's MBID is never
// reassigned, so a folder mixing two MB artists no longer corrupts a shared
// row (last-writer-wins). The result is independent of commit order.
function resolveArtistRow(
  localArtistId: string,
  mbArtistId: string,
  mbArtistName: string,
): string {
  // 1. A row already owns this MBID → it is canonical for this artist. Refresh
  //    its display name but never reassign its identity.
  const existing = getArtistIdByMbid(mbArtistId);
  if (existing) {
    updateArtist(existing, {
      canonicalName: mbArtistName,
      normalizedCanonicalName: normalizeString(mbArtistName),
    });
    return existing;
  }

  // 2. No row owns this MBID yet. Adopt the discovered placeholder row only if
  //    it is still unclaimed (no MBID) AND its name matches this credit — so
  //    the folder's own albumartist row takes its rightful MBID, while a
  //    co-credit by a different artist (e.g. MF Grimm in an "MF Doom" folder)
  //    gets its own row instead of hijacking the placeholder.
  const local = getArtistRowById(localArtistId);
  if (
    local &&
    local.musicbrainzId == null &&
    local.normalizedName === normalizeString(mbArtistName)
  ) {
    updateArtist(localArtistId, {
      musicbrainzId: mbArtistId,
      canonicalName: mbArtistName,
      normalizedCanonicalName: normalizeString(mbArtistName),
    });
    return localArtistId;
  }

  // 3. Otherwise create (or find by MBID) a dedicated row for this credit.
  return ensureArtistByMbid(mbArtistId, mbArtistName);
}

// Resolve an MB-resolved artist credit by MBID, upserting the row if no
// existing artist carries that MBID. Used for non-lead track-artist credits
// where there's no local row to canonicalise.
function ensureArtistByMbid(mbid: string, name: string): string {
  const existing = getArtistIdByMbid(mbid);
  if (existing) {
    updateArtist(existing, {
      canonicalName: name,
      normalizedCanonicalName: normalizeString(name),
    });
    return existing;
  }
  return upsertArtist(name, mbid);
}

function commitAlbum(
  currentAlbumId: string | null,
  canonicalArtistId: string,
  release: ResolvedRelease,
): string | null {
  // Look for an existing album row that already owns this release MBID.
  const canonical = findAlbumByReleaseMbid(
    canonicalArtistId,
    release.releaseMbid,
  );

  if (canonical && currentAlbumId && canonical.id !== currentAlbumId) {
    // Merge: move tracks off the local album onto canonical, then drop local.
    updateTrackByAlbumId(currentAlbumId, { albumId: canonical.id });
    deleteAlbum(currentAlbumId);
    updateAlbumByAlbumId(canonical.id, {
      canonicalTitle: release.title,
      releaseGroupMbid: release.releaseGroupMbid,
      releaseYear: release.releaseYear ?? canonical.releaseYear,
      confidenceScore: release.confidence,
    });
    return canonical.id;
  }

  if (canonical) {
    updateAlbumByAlbumId(canonical.id, {
      canonicalTitle: release.title,
      releaseGroupMbid: release.releaseGroupMbid,
      releaseYear: release.releaseYear ?? canonical.releaseYear,
      confidenceScore: release.confidence,
    });
    return canonical.id;
  }

  if (currentAlbumId) {
    // Album identity is shared by every track in the folder. Don't let a
    // lower-confidence track from a different release group rename the album
    // (e.g. a stray "All Eyez on Me" pick @0.3 clobbering a "Greatest Hits"
    // identity @0.95). Allow it only when the album has no release yet, the
    // pick is more confident, or it refines the same release group.
    const existing = getAlbumById(currentAlbumId);
    const existingConf = existing?.confidenceScore ?? null;
    const sameGroup =
      existing?.releaseGroupMbid != null &&
      existing.releaseGroupMbid === release.releaseGroupMbid;
    const shouldOverwrite =
      existing?.releaseMbid == null ||
      existingConf == null ||
      release.confidence > existingConf ||
      sameGroup;
    if (!shouldOverwrite) return currentAlbumId;

    updateAlbumByAlbumId(currentAlbumId, {
      releaseMbid: release.releaseMbid,
      releaseGroupMbid: release.releaseGroupMbid,
      canonicalTitle: release.title,
      releaseYear: release.releaseYear ?? undefined,
      confidenceScore: release.confidence,
    });
    return currentAlbumId;
  }

  return null;
}

export function commitResolution(input: CommitInput): void {
  const { trackId, currentArtistId, currentAlbumId, winner, release, tags } =
    input;

  const lead = winner.artistCredits[0];

  // Captured from the transaction so the post-commit cover-art side-effect can
  // target the final album row directly (it is now owned by the dominant lead,
  // not the discovered currentArtistId, so re-finding it by artist would miss).
  let committedAlbumId: string | null = null;

  db.transaction(() => {
    let leadArtistId = currentArtistId;
    if (lead) {
      leadArtistId = resolveArtistRow(currentArtistId, lead.mbid, lead.name);
    }

    // Settle the album's release identity (merge / release-mbid), keyed on this
    // track's lead — preserves the existing cross-folder album-merge behavior.
    const finalAlbumId = release
      ? commitAlbum(currentAlbumId, leadArtistId, release)
      : currentAlbumId;
    committedAlbumId = finalAlbumId;

    // Persist track-artist credits (compilation support). Includes the lead
    // artist at position 0 so list-tracks-by-artist can union over a single
    // join table.
    const credits = winner.artistCredits.map((c, idx) => ({
      artistId:
        idx === 0 && lead && c.mbid === lead.mbid
          ? leadArtistId
          : ensureArtistByMbid(c.mbid, c.name),
      position: idx,
      joinPhrase: c.joinPhrase,
    }));
    replaceTrackArtists(trackId, credits);

    // Track row final state — point at this track's lead credit, then mark
    // resolved so it counts toward the album's dominant-lead recompute below.
    updateTrackByTrackId(trackId, {
      artistId: leadArtistId,
      albumId: finalAlbumId,
    });

    markTrackResolved(trackId, {
      musicbrainzId: winner.recordingMbid,
      canonicalTitle: winner.title || null,
      confidenceScore: winner.score,
      resolutionMethod: winner.method,
      audioFingerprint: input.audioFingerprint,
    });

    // The album's primary artist is the dominant lead among its resolved
    // tracks (deterministic tiebreak in the query). Recomputed every commit,
    // so the final value is order-independent.
    if (finalAlbumId) {
      const owner = getDominantArtistIdForAlbum(finalAlbumId) ?? leadArtistId;
      const album = getAlbumById(finalAlbumId);
      if (album && album.artistId !== owner) {
        updateAlbumByAlbumId(finalAlbumId, { artistId: owner });
      }
    }

    upsertTrackFts(
      trackId,
      winner.title || tags.title,
      lead?.name ?? tags.artistName,
      release?.title ?? tags.albumTitle ?? "",
    );
  });

  // Schedule cover art + artist image fetch outside the transaction.
  if (release?.releaseMbid && committedAlbumId) {
    void populateAlbumArtists(release.releaseMbid, committedAlbumId);
  }

  if (release?.releaseGroupMbid) {
    const rgMbid = release.releaseGroupMbid;
    const albumId = committedAlbumId;
    void (async () => {
      try {
        const local = await ensureCoverOnDisk(rgMbid);
        if (local && albumId) {
          updateAlbumByAlbumId(albumId, { coverArtUrl: local });
        }
      } catch (err) {
        log.warn({ err, rgMbid }, "cover art fetch failed");
      }
    })();
  }

  if (lead) {
    const artistMbid = lead.mbid;
    void (async () => {
      try {
        const local = await ensureArtistImageOnDisk(artistMbid);
        if (local) {
          const artistId = getArtistIdByMbid(artistMbid);
          if (artistId) {
            updateArtist(artistId, { imageUrl: local });
          }
        }
      } catch (err) {
        log.warn({ err, artistMbid }, "artist image fetch failed");
      }
    })();
  }
}

export function isAutoCommit(score: number): boolean {
  return score >= AUTO_COMMIT_THRESHOLD;
}
