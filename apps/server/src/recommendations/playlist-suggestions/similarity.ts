import type { FastifyBaseLogger } from "fastify";
import { getSimilarTracks } from "../../lastfm/client.js";
import { normalizeString } from "../../musicbrainz/normalize.js";
import type { Candidate } from "../inhouse/candidates/service.js";
import { PER_SEED_CAP, TARGET_TRACKS } from "./constants.js";
import type { Seed } from "./seeds.js";

// Single-space separator over normalized names → composite key. Internal to this
// aggregator only; it never crosses into the resolution map (which keys on
// candidateNameKey instead — see the SP3 self-review note on key consistency).
const KEY_SEP = " ";
function nameKey(artist: string, title: string): string {
  return `${normalizeString(artist)}${KEY_SEP}${normalizeString(title)}`;
}

/** A track already in the playlist, to exclude from suggestions. */
export interface ExclusionEntry {
  recordingMbid: string | null;
  artist: string;
  title: string;
}

/** Fan out track.getSimilar across the seeds, aggregate neighbours by overlap
 * (distinct seeds that returned them), exclude in-playlist tracks, rank, and cap.
 * Returns ranked Candidates whose popularityRank is the final rank index, so the
 * downstream resolution preserves this order (design §6). */
export async function aggregateSimilar(
  seeds: Seed[],
  exclude: ExclusionEntry[],
  log: FastifyBaseLogger,
): Promise<Candidate[]> {
  const excludedMbids = new Set(
    exclude.map((e) => e.recordingMbid).filter((m): m is string => Boolean(m)),
  );
  const excludedKeys = new Set(exclude.map((e) => nameKey(e.artist, e.title)));

  interface Agg {
    name: string;
    artist: string;
    mbid: string | null;
    overlap: number;
    scoreSum: number;
  }
  const byKey = new Map<string, Agg>();

  // Address track.getSimilar by artist+title, NOT by the local recording MBID:
  // Last.fm's similarity index has poor per-recording-MBID coverage — addressing
  // by MBID frequently errors ("Track not found", code 6) or returns an empty
  // neighbour set even when the MBID resolves, whereas the name lookup resolves
  // reliably. Mirrors the resolution layer's "don't trust Last.fm MBIDs" stance
  // (decision E4). (SP3 fix.)
  const perSeed = await Promise.all(
    seeds.map((s) =>
      getSimilarTracks({ artist: s.artist, title: s.title }, PER_SEED_CAP),
    ),
  );

  for (const neighbours of perSeed) {
    const seenThisSeed = new Set<string>();
    for (const n of neighbours) {
      const key = nameKey(n.artist, n.name);
      if (excludedKeys.has(key)) continue;
      if (n.mbid && excludedMbids.has(n.mbid)) continue;
      if (seenThisSeed.has(key)) continue; // one overlap++ per seed max
      seenThisSeed.add(key);
      const existing = byKey.get(key);
      if (existing) {
        existing.overlap += 1;
        existing.scoreSum += n.matchScore;
        if (!existing.mbid && n.mbid) existing.mbid = n.mbid;
      } else {
        byKey.set(key, {
          name: n.name,
          artist: n.artist,
          mbid: n.mbid,
          overlap: 1,
          scoreSum: n.matchScore,
        });
      }
    }
  }

  const ranked = [...byKey.values()].sort(
    (a, b) => b.overlap - a.overlap || b.scoreSum - a.scoreSum,
  );
  log.debug(
    { seedCount: seeds.length, candidateCount: ranked.length },
    "playlist suggestions: aggregated similar tracks",
  );
  return ranked.slice(0, TARGET_TRACKS).map((a, index) => ({
    name: a.name,
    artist: a.artist,
    mbid: a.mbid,
    popularityRank: index,
  }));
}
