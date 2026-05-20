import { logger } from "../logger.js";
import { db } from "../db/client.js";
import {
  deleteAlbum,
  findAlbumByReleaseMbid,
  getAlbumById,
  updateAlbumByAlbumId,
  updateAlbumByArtistId,
} from "../db/queries/albums.js";
import {
  deleteArtist,
  getArtistIdByMbid,
  updateArtist,
  upsertArtist,
} from "../db/queries/artists.js";
import {
  markTrackResolved,
  updateTrackByArtistId,
  updateTrackByAlbumId,
  updateTrackByTrackId,
} from "../db/queries/tracks.js";
import { upsertTrackFts } from "../db/queries/tracks-fts.js";
import { replaceTrackArtists } from "../db/queries/track-artists.js";
import { ensureCoverOnDisk } from "../coverart/store.js";
import { ensureArtistImageOnDisk } from "../artistimage/store.js";
import type { ScoredCandidate, ResolvedRelease, RawTags } from "./types.js";
import {
  AUTO_COMMIT_THRESHOLD,
} from "./scoring.js";

const log = logger.child({ module: "library:commit" });

interface CommitInput {
  trackId: string;
  currentArtistId: string;
  currentAlbumId: string | null;
  winner: ScoredCandidate;
  release: ResolvedRelease | null;
  tags: RawTags;
  audioFingerprint: string | null;
}

// Resolve the canonical artist row for a given (mbid, name) pair. If an
// artist row already exists with this MBID and is NOT the local artist,
// repoints tracks and albums onto canonical and deletes the local row.
function resolveArtistRow(
  localArtistId: string,
  mbArtistId: string,
  mbArtistName: string,
): string {
  const canonicalArtistId = getArtistIdByMbid(mbArtistId);
  if (canonicalArtistId && canonicalArtistId !== localArtistId) {
    updateTrackByArtistId(localArtistId, { artistId: canonicalArtistId });
    updateAlbumByArtistId(localArtistId, { artistId: canonicalArtistId });
    deleteArtist(localArtistId);
    updateArtist(canonicalArtistId, { canonicalName: mbArtistName });
    return canonicalArtistId;
  }
  if (!canonicalArtistId) {
    updateArtist(localArtistId, {
      musicbrainzId: mbArtistId,
      canonicalName: mbArtistName,
    });
  }
  return localArtistId;
}

// Resolve an MB-resolved artist credit by MBID, upserting the row if no
// existing artist carries that MBID. Used for non-lead track-artist credits
// where there's no local row to canonicalise.
function ensureArtistByMbid(mbid: string, name: string): string {
  const existing = getArtistIdByMbid(mbid);
  if (existing) {
    updateArtist(existing, { canonicalName: name });
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

  db.transaction(() => {
    let canonicalArtistId = currentArtistId;
    if (lead) {
      canonicalArtistId = resolveArtistRow(
        currentArtistId,
        lead.mbid,
        lead.name,
      );
    }

    // Repoint album to canonical artist if it changed.
    if (currentAlbumId && canonicalArtistId !== currentArtistId) {
      const album = getAlbumById(currentAlbumId);
      if (album && album.artistId !== canonicalArtistId) {
        updateAlbumByAlbumId(currentAlbumId, { artistId: canonicalArtistId });
      }
    }

    const finalAlbumId = release
      ? commitAlbum(currentAlbumId, canonicalArtistId, release)
      : currentAlbumId;

    // Persist track-artist credits (compilation support). Includes the lead
    // artist at position 0 so list-tracks-by-artist can union over a single
    // join table.
    const credits = winner.artistCredits.map((c, idx) => ({
      artistId:
        idx === 0 && lead && c.mbid === lead.mbid
          ? canonicalArtistId
          : ensureArtistByMbid(c.mbid, c.name),
      position: idx,
      joinPhrase: c.joinPhrase,
    }));
    replaceTrackArtists(trackId, credits);

    // Track row final state.
    updateTrackByTrackId(trackId, {
      artistId: canonicalArtistId,
      albumId: finalAlbumId,
    });

    markTrackResolved(trackId, {
      musicbrainzId: winner.recordingMbid,
      canonicalTitle: winner.title || null,
      confidenceScore: winner.score,
      resolutionMethod: winner.method,
      audioFingerprint: input.audioFingerprint,
    });

    upsertTrackFts(
      trackId,
      winner.title || tags.title,
      lead?.name ?? tags.artistName,
      release?.title ?? tags.albumTitle ?? "",
    );
  });

  // Schedule cover art + artist image fetch outside the transaction.
  if (release?.releaseGroupMbid) {
    const rgMbid = release.releaseGroupMbid;
    void (async () => {
      try {
        const local = await ensureCoverOnDisk(rgMbid);
        if (local) {
          const album = release.releaseMbid
            ? findAlbumByReleaseMbid(
                input.currentArtistId,
                release.releaseMbid,
              )
            : null;
          if (album) {
            updateAlbumByAlbumId(album.id, { coverArtUrl: local });
          }
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
