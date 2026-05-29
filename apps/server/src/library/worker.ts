import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger.js";
import { db } from "../db/client.js";
import {
  getArtistIdByMbid,
  updateArtist,
  upsertArtist,
} from "../db/queries/artists.js";
import { upsertAlbumForDiscovery } from "../db/queries/albums.js";
import {
  clearPendingRemoval,
  deleteTrackById,
  getTrackByFilePath,
  getTrackByFingerprint,
  getTracksPendingRemovalBefore,
  markPendingRemovalByPath,
  markTrackFailed,
  markTrackResolving,
  repointTrackPath,
  setAudioFingerprint,
  updateTrackByTrackId,
  upsertDiscoveredTrack,
} from "../db/queries/tracks.js";
import { replaceTrackArtists } from "../db/queries/track-artists.js";
import { extractTags } from "./evidence/tags.js";
import { fingerprintFile } from "./evidence/fingerprint.js";
import { candidatesFromTags } from "./candidates/fromTags.js";
import { candidatesFromAcoustid } from "./candidates/fromAcoustid.js";
import { candidatesFromSearch } from "./candidates/fromSearch.js";
import { pickWinner, scoreCandidates } from "./scoring.js";
import { pickRelease } from "./graphWalk.js";
import { commitResolution } from "./commit.js";
import { lookupRecordingRich } from "./mbLookup.js";
import { normalizeString } from "../musicbrainz/client.js";
import { enqueueEnrichment, enqueueResolution } from "./queue.js";
import { libraryProgress } from "./state.js";
import type {
  Evidence,
  RawTags,
  RecordingCandidate,
  ResolvedRelease,
  ScoredCandidate,
} from "./types.js";

const log = logger.child({ module: "library:worker" });

// ── Discovery stage ────────────────────────────────────────────────────────
// Cheap, local-IO only: stat + tag extract + row upsert. Surfaces a `pending`
// row immediately, then hands the file to the resolution queue. No network.
export async function discoverFile(filePath: string): Promise<void> {
  let stat: { size: number; mtimeMs: number };
  try {
    const s = await fs.stat(filePath);
    stat = { size: s.size, mtimeMs: s.mtimeMs };
  } catch (err) {
    log.debug({ err, filePath }, "stat failed; skipping discovery");
    return;
  }

  const existing = getTrackByFilePath(filePath);

  // mtime short-circuit: already resolved and unchanged → nothing to do.
  if (
    existing &&
    existing.resolutionStatus === "resolved" &&
    existing.fileMtime != null &&
    existing.fileMtime === Math.floor(stat.mtimeMs) &&
    existing.fileSizeBytes === stat.size
  ) {
    return;
  }

  if (existing?.pendingRemovalAt) {
    clearPendingRemoval(existing.id);
  }

  let tags: RawTags;
  try {
    tags = await extractTags(filePath, stat.size, stat.mtimeMs);
  } catch (err) {
    log.warn({ err, filePath }, "tag extraction failed during discovery");
    libraryProgress.failed++;
    return;
  }

  const rawArtistName = tags.albumArtist ?? tags.artistName;
  const artistId = upsertArtist(rawArtistName, tags.mbAlbumArtistId);
  const albumId = tags.albumTitle
    ? upsertAlbumForDiscovery(
        tags.albumTitle,
        artistId,
        tags.year,
        tags.mbAlbumId,
        tags.mbReleaseGroupId,
      )
    : null;

  upsertDiscoveredTrack(
    {
      filePath,
      title: tags.title,
      artistId,
      albumId,
      trackNumber: tags.trackNumber,
      discNumber: tags.discNumber,
      durationSeconds: tags.durationSeconds,
      fileFormat: tags.fileFormat,
      fileSizeBytes: tags.fileSizeBytes,
      fileMtime: tags.fileMtime,
      mbRecordingId: tags.mbRecordingId,
    },
    rawArtistName,
    tags.albumTitle,
  );

  libraryProgress.scanned++;
  enqueueResolution(filePath);
}

// ── Resolution stage ─────────────────────────────────────────────────────────
// MusicBrainz-bound. Re-extracts tags from the file (the file is the source of
// truth; nothing is carried in memory across the discovery→resolution boundary,
// so the pipeline is fully restart-resumable).
export async function resolveTrack(filePath: string): Promise<void> {
  libraryProgress.inFlight++;
  try {
    await doResolve(filePath);
  } catch (err) {
    log.error({ err, filePath }, "worker crashed resolving track");
    libraryProgress.failed++;
  } finally {
    libraryProgress.inFlight--;
  }
}

async function doResolve(filePath: string): Promise<void> {
  const row = getTrackByFilePath(filePath);
  if (!row) {
    log.debug({ filePath }, "resolve: row missing (deleted since discovery)");
    return;
  }

  let stat: { size: number; mtimeMs: number };
  try {
    const s = await fs.stat(filePath);
    stat = { size: s.size, mtimeMs: s.mtimeMs };
  } catch (err) {
    log.debug({ err, filePath }, "resolve: stat failed; skipping");
    return;
  }

  // Guard duplicate enqueues / restart races: resolved + unchanged → done.
  if (
    row.resolutionStatus === "resolved" &&
    row.fileMtime != null &&
    row.fileMtime === Math.floor(stat.mtimeMs) &&
    row.fileSizeBytes === stat.size
  ) {
    return;
  }

  let tags: RawTags;
  try {
    tags = await extractTags(filePath, stat.size, stat.mtimeMs);
  } catch (err) {
    log.warn({ err, filePath }, "tag extraction failed during resolution");
    markTrackFailed(row.id, { confidenceScore: 0, audioFingerprint: null });
    libraryProgress.failed++;
    return;
  }

  markTrackResolving(row.id);

  // Fast path (B): a fully Picard-tagged file is trusted at confidence 1.0 with
  // no MusicBrainz call. The full artist-credit list, canonical title and
  // fingerprint are filled in by background enrichment afterward.
  if (
    tags.mbRecordingId &&
    tags.mbAlbumId &&
    tags.mbReleaseGroupId &&
    tags.mbAlbumArtistId
  ) {
    commitFromTags(row.id, row.artistId, row.albumId, tags);
    enqueueEnrichment(row.id, filePath, tags.mbRecordingId);
    libraryProgress.resolved++;
    return;
  }

  // Normal path: fingerprint (CPU-bound) ∥ tag-MBID lookup (network-bound).
  const [fp, tagCandidates] = await Promise.all([
    fingerprintFile(filePath),
    candidatesFromTags({
      filePath,
      tags,
      fingerprint: null,
      fingerprintDuration: null,
    }),
  ]);

  // Rename detection: a different row carrying this exact chromaprint is the
  // same audio under a new path. Adopt it (preserving playlist + history) and
  // resolve using the new file's discovered artist/album ids.
  if (fp?.fingerprint) {
    const renameSource = findRenameCandidate(fp.fingerprint, row.id);
    if (renameSource && renameSource.id !== row.id) {
      log.info(
        { from: renameSource.filePath, to: filePath, trackId: renameSource.id },
        "reattaching track row to new path (rename detected)",
      );
      const adoptArtistId = row.artistId;
      const adoptAlbumId = row.albumId;
      deleteTrackById(row.id);
      repointTrackPath(
        renameSource.id,
        filePath,
        Math.floor(stat.mtimeMs),
        stat.size,
      );
      await finishResolution(
        renameSource.id,
        adoptArtistId,
        adoptAlbumId,
        filePath,
        tags,
        fp,
        tagCandidates,
      );
      return;
    }
    setAudioFingerprint(row.id, fp.fingerprint);
  }

  await finishResolution(
    row.id,
    row.artistId,
    row.albumId,
    filePath,
    tags,
    fp,
    tagCandidates,
  );
}

// Shared resolution tail: candidate generation → scoring → winner enrichment
// → release pick → commit. `pretagCandidates` lets callers reuse a tag lookup
// already performed in parallel with fingerprinting.
async function finishResolution(
  trackId: string,
  artistId: string,
  albumId: string | null,
  filePath: string,
  tags: RawTags,
  fp: { fingerprint: string; duration: number } | null,
  pretagCandidates?: RecordingCandidate[],
): Promise<void> {
  const evidence: Evidence = {
    filePath,
    tags,
    fingerprint: fp?.fingerprint ?? null,
    fingerprintDuration: fp?.duration ?? null,
  };

  const tagCandidates =
    pretagCandidates ?? (await candidatesFromTags(evidence));

  // Tag-MBID alone is a deterministic 1.0 win; only fan out to acoustid/search
  // when no tag candidate exists.
  const hasTagWin = tagCandidates.length > 0;
  const [acoustidCandidates, searchCandidates] = hasTagWin
    ? [[], []]
    : await Promise.all([
        candidatesFromAcoustid(evidence),
        candidatesFromSearch(evidence),
      ]);

  const allCandidates = [
    ...tagCandidates,
    ...acoustidCandidates,
    ...searchCandidates,
  ];

  if (allCandidates.length === 0) {
    log.warn({ filePath }, "no candidates produced");
    markTrackFailed(trackId, {
      confidenceScore: 0,
      audioFingerprint: fp?.fingerprint ?? null,
    });
    libraryProgress.failed++;
    return;
  }

  const scored = scoreCandidates(allCandidates, tags);
  const winner = pickWinner(scored);
  if (!winner) {
    markTrackFailed(trackId, {
      confidenceScore: 0,
      audioFingerprint: fp?.fingerprint ?? null,
    });
    libraryProgress.failed++;
    return;
  }

  // (C) AcoustID candidates are scored from inline metadata and carry no
  // release graph. Enrich the winner only (one MB call) so release
  // disambiguation still sees the full release set.
  if (winner.method !== "tag_mbid" && winner.releases.length === 0) {
    const enriched = await lookupRecordingRich(
      winner.recordingMbid,
      winner.method,
      winner.acoustidScore,
    );
    if (enriched) {
      winner.releases = enriched.releases;
      if (enriched.artistCredits.length > 0) {
        winner.artistCredits = enriched.artistCredits;
      }
      if (!winner.title) winner.title = enriched.title;
    }
  }

  const release = pickRelease(winner, tags);

  commitResolution({
    trackId,
    currentArtistId: artistId,
    currentAlbumId: albumId,
    winner,
    release,
    tags,
    audioFingerprint: fp?.fingerprint ?? null,
  });

  libraryProgress.resolved++;
}

// Fast-path commit: synthesise a winner + release directly from trusted file
// tags. Reuses the normal commit transaction (artist canonicalise, album merge,
// FTS, cover-art/artist-image side effects) — no MusicBrainz call.
function commitFromTags(
  trackId: string,
  artistId: string,
  albumId: string | null,
  tags: RawTags,
): void {
  const winner: ScoredCandidate = {
    method: "tag_mbid",
    recordingMbid: tags.mbRecordingId!,
    title: tags.title,
    durationMs:
      tags.durationSeconds != null ? tags.durationSeconds * 1000 : null,
    artistCredits: [
      {
        mbid: tags.mbAlbumArtistId!,
        name: tags.albumArtist ?? tags.artistName,
        joinPhrase: null,
      },
    ],
    releases: [],
    acoustidScore: null,
    score: 1.0,
  };

  const release: ResolvedRelease = {
    releaseMbid: tags.mbAlbumId!,
    releaseGroupMbid: tags.mbReleaseGroupId,
    title: tags.albumTitle ?? "",
    releaseYear: tags.year,
    confidence: 1.0,
  };

  commitResolution({
    trackId,
    currentArtistId: artistId,
    currentAlbumId: albumId,
    winner,
    release,
    tags,
    audioFingerprint: null,
  });
}

// ── Background enrichment ────────────────────────────────────────────────────
// Runs after a fast-path commit. Best-effort: backfills the chromaprint (so the
// track participates in rename detection) and the full artist-credit list +
// canonical title from MusicBrainz. Failures leave the tag-trusted row intact.
export async function enrichTrack(
  trackId: string,
  filePath: string,
  recordingMbid: string,
): Promise<void> {
  try {
    const fp = await fingerprintFile(filePath);
    if (fp?.fingerprint) setAudioFingerprint(trackId, fp.fingerprint);

    const rich = await lookupRecordingRich(recordingMbid, "tag_mbid", null);
    if (!rich) return;

    db.transaction(() => {
      const credits = rich.artistCredits.map((c, idx) => {
        const existing = getArtistIdByMbid(c.mbid);
        const aId = existing ?? upsertArtist(c.name, c.mbid);
        if (existing)
          updateArtist(existing, {
            canonicalName: c.name,
            normalizedCanonicalName: normalizeString(c.name),
          });
        return { artistId: aId, position: idx, joinPhrase: c.joinPhrase };
      });
      if (credits.length > 0) replaceTrackArtists(trackId, credits);
      if (rich.title) {
        updateTrackByTrackId(trackId, { canonicalTitle: rich.title });
      }
    });
  } catch (err) {
    log.warn({ err, trackId, recordingMbid }, "track enrichment failed");
  }
}

function findRenameCandidate(
  fingerprint: string,
  excludeTrackId: string,
): { id: string; filePath: string } | null {
  const candidate = getTrackByFingerprint(fingerprint, excludeTrackId);
  if (!candidate) return null;
  return { id: candidate.id, filePath: candidate.filePath };
}

export async function janitorSweepPendingRemoval(
  cutoffMs: number,
): Promise<void> {
  const stale = getTracksPendingRemovalBefore(cutoffMs);
  for (const row of stale) {
    log.debug({ trackId: row.id, filePath: row.filePath }, "janitor deleting");
    deleteTrackById(row.id);
  }
}

export function markPathPendingRemoval(filePath: string): void {
  markPendingRemovalByPath(filePath, Date.now());
}

export function describeFile(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}
