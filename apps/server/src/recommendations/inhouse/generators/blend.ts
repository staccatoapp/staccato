import type { HeardIndex } from "../profile/heard.js";
import type { Candidate } from "../candidates/service.js";

export type HeardPolicy = "exclude" | "downweight";

export interface BlendSource {
  candidates: Candidate[];
  /** Optional relative weight for proportional interleave. Omitted → 1 (the
   * round-robin case). */
  weight?: number;
}

/** Merge one or more popularity-ordered candidate lists into a single ordered
 * list (recs spec §7):
 *  1. dedup by (artist|title), case-insensitive, keeping the lowest-rank copy;
 *  2. apply the heard policy (drop, or sink heard behind unheard) via `heard`;
 *  3. interleave the sources — round-robin when weights are equal/absent,
 *     weight-proportional when weights differ (stride key `(i+1)/weight`: a
 *     higher weight divides each rank down, pulling that source's items to
 *     earlier positions and giving it a denser share of the head);
 *  4. cap to `limit`.
 * MBID-less candidates can't be heard-matched, so they count as unheard. */
export function blendCandidates(
  sources: BlendSource[],
  heard: HeardIndex,
  policy: HeardPolicy,
  limit: number,
): Candidate[] {
  // 1. Global dedup by (artist|title), keeping the lowest popularityRank. Scan
  // sources then within-source order so ties resolve to the earliest occurrence.
  const best = new Map<string, { candidate: Candidate; rank: number }>();
  for (const source of sources) {
    for (const c of source.candidates) {
      const k = dedupKey(c);
      const prev = best.get(k);
      if (!prev || c.popularityRank < prev.rank) {
        best.set(k, { candidate: c, rank: c.popularityRank });
      }
    }
  }
  const kept = new Set([...best.values()].map((b) => b.candidate));

  // 2 + 3. Per source: filter to kept, apply heard policy, then emit stride keys.
  type Entry = {
    candidate: Candidate;
    sortKey: number;
    sourceIdx: number;
    i: number;
  };
  const entries: Entry[] = [];
  sources.forEach((source, sourceIdx) => {
    // Relies on each source holding distinct Candidate object references (every
    // source is a fresh API result). Candidates drawn from a shared array must be
    // copied, or the same reference would survive in multiple sources and duplicate.
    const filtered = source.candidates.filter((c) => kept.has(c));
    const ordered = applyHeardPolicy(filtered, heard, policy);
    // A non-positive or non-finite weight is meaningless as a proportional share and
    // would produce an Infinity/negative stride key, silently dropping or reordering
    // the source. Fall back to equal (round-robin) participation instead.
    const weight =
      source.weight !== undefined &&
      Number.isFinite(source.weight) &&
      source.weight > 0
        ? source.weight
        : 1;
    ordered.forEach((candidate, i) => {
      entries.push({ candidate, sortKey: (i + 1) / weight, sourceIdx, i });
    });
  });

  entries.sort(
    (a, b) => a.sortKey - b.sortKey || a.sourceIdx - b.sourceIdx || a.i - b.i,
  );

  // 4. Cap.
  return entries.slice(0, limit).map((e) => e.candidate);
}

function dedupKey(c: Candidate): string {
  return `${c.artist.trim().toLowerCase()}|${c.name.trim().toLowerCase()}`;
}

/** "exclude" removes heard candidates; "downweight" stable-partitions unheard
 * before heard, preserving order within each group. MBID-less = unheard. */
function applyHeardPolicy(
  candidates: Candidate[],
  heard: HeardIndex,
  policy: HeardPolicy,
): Candidate[] {
  if (policy === "exclude") {
    return candidates.filter((c) => !(c.mbid && heard.isHeard(c.mbid)));
  }
  const unheard: Candidate[] = [];
  const heardList: Candidate[] = [];
  for (const c of candidates) {
    if (c.mbid && heard.isHeard(c.mbid)) heardList.push(c);
    else unheard.push(c);
  }
  return [...unheard, ...heardList];
}
