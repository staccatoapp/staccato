import type { FastifyBaseLogger } from "fastify";
import type {
  RecommendedPlaylist,
  RecommendedPlaylistTrack,
} from "@staccato/shared";
import { ensureCoverOnDisk } from "../../../coverart/store.js";
import { getTracksByMusicbrainzIds } from "../../../db/queries/tracks.js";
import { resolveRecordingByName } from "../../../library/candidates/fromSearch.js";
import { scoreCandidates } from "../../../library/scoring.js";
import type {
  RawTags,
  ReleaseCandidate,
  ScoredCandidate,
} from "../../../library/types.js";
import {
  lookupRecording,
  MB_PRIORITY,
  type MBRecordingDetail,
} from "../../../musicbrainz/client.js";
import type { Candidate } from "../candidates/service.js";
import type { PlaylistSpec } from "../generators/types.js";

/** Acceptance floor for name-resolved candidates. Deliberately below the
 * importer's AUTO_COMMIT_THRESHOLD (0.85): import writes canonical rows (high
 * stakes), recs are virtual/previewable (favour yield). Last.fm candidates lack
 * duration & AcoustID, so a perfect title+artist match tops out ~0.786 — start
 * ~0.70 and tune up against observed hit-rate (recs spec §5 / decision E5). */
export const RECS_RESOLUTION_THRESHOLD = 0.7;

export const RECS_NAME_KEY_SEP = " ";
export function candidateNameKey(artist: string, title: string): string {
  return `${artist.toLowerCase()}${RECS_NAME_KEY_SEP}${title.toLowerCase()}`;
}

/** A full RawTags with neutral values — scoreCandidates only reads title,
 * artistName and durationSeconds, but RawTags is built explicitly (no cast) so
 * the absent fields are honestly null/empty. Last.fm gives us no duration or
 * AcoustID, so durationAgreement returns its neutral 0.5. */
function minimalTags(artist: string, title: string): RawTags {
  return {
    title,
    artistName: artist,
    albumTitle: null,
    albumArtist: null,
    trackNumber: null,
    discNumber: null,
    durationSeconds: null,
    year: null,
    fileFormat: "",
    fileSizeBytes: 0,
    fileMtime: 0,
    mbRecordingId: null,
    mbAlbumId: null,
    mbAlbumArtistId: null,
    mbReleaseGroupId: null,
    mbTrackArtistId: null,
  };
}

/** Release-type preference, mirroring the importer's canonical-release policy
 * (musicbrainz/client.ts `pickCanonicalRelease`): clean Official studio Albums
 * rank best, then EP/Single, with non-Official and any extra-typed release
 * (Compilation, DJ-mix, Live, Soundtrack…) pushed down. Lower = more canonical. */
const PRIMARY_TYPE_RANK: Record<string, number> = {
  Album: 0,
  EP: 1,
  Single: 2,
  Broadcast: 3,
  Other: 4,
};
const SECONDARY_TYPE_PENALTY = 5;
const NON_OFFICIAL_PENALTY = 10;

function releaseRank(r: ReleaseCandidate): number {
  let rank = PRIMARY_TYPE_RANK[r.primaryType ?? "Other"] ?? 4;
  if (r.status !== "Official") rank += NON_OFFICIAL_PENALTY;
  if (r.secondaryTypes.length > 0) rank += SECONDARY_TYPE_PENALTY;
  return rank;
}

/** A recording's canonical-ness = its best (lowest-ranked) release. A recording
 * with no releases sorts last. */
function recordingCanonicalRank(c: ScoredCandidate): number {
  if (c.releases.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...c.releases.map(releaseRank));
}

/** Pick the winning recording among a (artist, title)'s scored search
 * candidates, or null if none clears RECS_RESOLUTION_THRESHOLD. Tiebreak
 * priority:
 *   1. already in the local library — the ONLY reliable in-library convergence
 *      signal (a song may be owned as an album OR a compilation, so release type
 *      cannot stand in for ownership);
 *   2. most canonical release (clean Official Album over compilation/DJ-mix) —
 *      strictly below ownership, so it only decides not-owned discovery tracks
 *      and never overrides a real library hit; drives display quality;
 *   3. score, then original search order (a stable sort preserves the latter).
 *
 * Last.fm candidates all tie on title/artist similarity and carry no duration,
 * so without (1)/(2) the winner was just MusicBrainz's first search hit — which
 * routinely picked a compilation recording the importer never used, flipping an
 * owned track to "not in library" (recs spec decision E4). */
function selectWinner(
  scored: ScoredCandidate[],
  isInLibrary: (mbid: string) => boolean,
): ScoredCandidate | null {
  const eligible = scored.filter((c) => c.score >= RECS_RESOLUTION_THRESHOLD);
  if (eligible.length === 0) return null;
  return (
    [...eligible].sort((a, b) => {
      const libDelta =
        Number(isInLibrary(b.recordingMbid)) -
        Number(isInLibrary(a.recordingMbid));
      if (libDelta !== 0) return libDelta;
      const rankDelta = recordingCanonicalRank(a) - recordingCanonicalRank(b);
      if (rankDelta !== 0) return rankDelta;
      return b.score - a.score;
    })[0] ?? null
  );
}

/** Shared batched resolution nucleus. Name-resolves every distinct
 * (artist, title) in `candidates` (the Last.fm mbid is NOT trusted — see the
 * inline note on step 1 of resolvePlaylists / decision E4), picks the owned-first
 * winner via selectWinner, then batch-enriches the survivors and returns a map
 * keyed by candidateNameKey(artist, title) → assembled RecommendedPlaylistTrack.
 * Unresolved / un-enriched (artist, title)s are absent (callers drop them).
 * Reused by resolvePlaylists (per-spec grouping) and the SP3 playlist-suggestions
 * compute (flat list). */
export async function resolveCandidates(
  candidates: Candidate[],
  log: FastifyBaseLogger,
): Promise<Map<string, RecommendedPlaylistTrack>> {
  // 1. Name-resolve every distinct (artist, title) once. We do NOT trust the
  //    Last.fm candidate mbid: in practice it is too flaky — a large share are
  //    non-MusicBrainz (e.g. version-3 UUIDs) or stale/merged ids that 404, and
  //    even the ones that resolve can point at the wrong recording (no score, no
  //    gate). The mirror's scored search, accepted only at RECS_RESOLUTION_-
  //    THRESHOLD, is the reliable signal and yields a canonical mbid (which also
  //    sharpens in-library detection). Supersedes the original trust-the-mbid
  //    policy (recs spec decision E4).
  const toResolve = new Map<string, { artist: string; title: string }>();
  for (const c of candidates) {
    toResolve.set(candidateNameKey(c.artist, c.name), {
      artist: c.artist,
      title: c.name,
    });
  }
  const scoredByName = new Map<string, ScoredCandidate[]>();
  await Promise.all(
    [...toResolve].map(async ([key, q]) => {
      const found = await resolveRecordingByName({
        artist: q.artist,
        title: q.title,
      });
      scoredByName.set(
        key,
        found.length === 0
          ? []
          : scoreCandidates(found, minimalTags(q.artist, q.title)),
      );
    }),
  );

  // 2. One batched local-library lookup over the FULL candidate superset (every
  //    search hit, not just the winners). Reused twice below: to bias winner
  //    selection toward an already-owned recording, and to short-circuit
  //    MusicBrainz enrichment for the winners that turn out to be owned.
  const candidateMbids = [
    ...new Set(
      [...scoredByName.values()].flatMap((l) => l.map((c) => c.recordingMbid)),
    ),
  ];
  const localMap = getTracksByMusicbrainzIds(candidateMbids);

  // 3. Pick the owned-first winning mbid per (artist, title): owned-first, then
  //    most canonical release, then score/search order (see selectWinner). This
  //    converges owned songs onto the same recording the importer committed,
  //    fixing the false "not in library" the old top-search-hit tiebreak caused.
  const resolvedByName = new Map<string, string | null>();
  for (const [key, scored] of scoredByName) {
    const winner = selectWinner(scored, (m) => localMap.has(m));
    if (!winner) {
      const q = toResolve.get(key);
      log.debug(
        {
          artist: q?.artist,
          title: q?.title,
          bestScore: scored.length
            ? Math.max(...scored.map((c) => c.score))
            : null,
        },
        "recs resolve: no candidate cleared threshold",
      );
    }
    resolvedByName.set(key, winner?.recordingMbid ?? null);
  }

  // 4. MusicBrainz enrichment for resolved winners not owned locally; a null
  //    lookup is the lazy validation of a bad/dead mbid (E4) → the track drops.
  const resolvedMbids = [
    ...new Set(
      [...resolvedByName.values()].filter((m): m is string => m !== null),
    ),
  ];
  const nonLocal = resolvedMbids.filter((m) => !localMap.has(m));
  const recDetails = await Promise.all(
    nonLocal.map((m) => lookupRecording(m, MB_PRIORITY.BACKGROUND)),
  );
  const recMap = new Map<string, MBRecordingDetail>();
  nonLocal.forEach((mbid, i) => {
    const d = recDetails[i];
    if (d) recMap.set(mbid, d);
  });

  // Cover art batched per release-group.
  const rgSet = new Set<string>();
  for (const rec of recMap.values()) {
    if (rec.releaseGroupMbid) rgSet.add(rec.releaseGroupMbid);
  }
  const rgList = [...rgSet];
  const coverResults = await Promise.all(
    rgList.map((rg) => ensureCoverOnDisk(rg, MB_PRIORITY.BACKGROUND)),
  );
  const coverMap = new Map(
    rgList.map((rg, i) => [rg, coverResults[i] ?? null]),
  );

  // 5. Assemble one RecommendedPlaylistTrack per resolved (artist, title).
  const result = new Map<string, RecommendedPlaylistTrack>();
  // Representative original-case candidate per key for the artist-name fallback.
  const repByKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const k = candidateNameKey(c.artist, c.name);
    if (!repByKey.has(k)) repByKey.set(k, c);
  }
  for (const [key, mbid] of resolvedByName) {
    if (!mbid) continue;
    const candidate = repByKey.get(key)!;
    const local = localMap.get(mbid);
    if (local) {
      result.set(key, {
        recordingMbid: mbid,
        title: local.title,
        artistName: local.artistName,
        artistMbid: local.artistMbid,
        albumTitle: local.albumTitle,
        releaseGroupMbid: local.releaseGroupMbid,
        durationMs: local.durationMs,
        coverArtUrl: local.coverArtUrl,
        inLibrary: true,
        localTrackId: local.trackId,
      });
      continue;
    }
    const rec = recMap.get(mbid);
    if (!rec) {
      log.debug(
        { recordingMbid: mbid },
        "recs resolve: dropping candidate with failed enrichment",
      );
      continue;
    }
    const coverArtUrl = rec.releaseGroupMbid
      ? (coverMap.get(rec.releaseGroupMbid) ?? null)
      : null;
    result.set(key, {
      recordingMbid: mbid,
      title: rec.title,
      artistName: rec.artistName ?? candidate.artist,
      artistMbid: rec.artistMbid,
      albumTitle: rec.releaseName,
      releaseGroupMbid: rec.releaseGroupMbid,
      durationMs: rec.durationMs,
      coverArtUrl,
      inLibrary: false,
      localTrackId: null,
    });
  }
  return result;
}

/**
 * Turn generators' PlaylistSpec[] into serveable RecommendedPlaylist[] in one
 * batched pass (mirrors listenbrainz-playlists.ts): resolve every candidate via
 * the shared resolveCandidates nucleus, then group per spec preserving generator
 * order minus drops (recs spec §8). An all-dropped playlist is not served.
 */
export async function resolvePlaylists(
  specs: PlaylistSpec[],
  log: FastifyBaseLogger,
): Promise<RecommendedPlaylist[]> {
  const resolved = await resolveCandidates(
    specs.flatMap((s) => s.candidates),
    log,
  );

  const playlists: RecommendedPlaylist[] = [];
  for (const spec of specs) {
    const tracks: RecommendedPlaylistTrack[] = [];
    for (const c of spec.candidates) {
      const t = resolved.get(candidateNameKey(c.artist, c.name));
      if (t) tracks.push(t);
    }
    log.info(
      {
        playlistId: spec.id,
        resolved: tracks.length,
        candidates: spec.candidates.length,
      },
      "recs resolve: playlist resolved",
    );
    if (tracks.length === 0) continue;
    playlists.push({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      trackCount: tracks.length,
      tracks,
      coverArtUrl:
        tracks.find((t) => t.coverArtUrl !== null)?.coverArtUrl ?? null,
      expiresAt: null,
      source: "staccato",
    });
  }
  return playlists;
}
