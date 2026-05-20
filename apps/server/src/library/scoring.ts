import { normalizeString } from "../musicbrainz/client.js";
import type {
  RecordingCandidate,
  RawTags,
  ScoredCandidate,
} from "./types.js";

export const AUTO_COMMIT_THRESHOLD = 0.85;
export const TAG_VERIFIED_SCORE = 1.0;

function levenshteinRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    new Array(lb + 1).fill(0),
  );
  for (let i = 0; i <= la; i++) dp[i]![0] = i;
  for (let j = 0; j <= lb; j++) dp[0]![j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  const dist = dp[la]![lb]!;
  const maxLen = Math.max(la, lb);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

export function stringSimilarity(a: string, b: string): number {
  return levenshteinRatio(normalizeString(a), normalizeString(b));
}

function durationAgreement(
  localSec: number | null,
  candidateMs: number | null,
): number {
  if (localSec == null || candidateMs == null) return 0.5;
  const candidateSec = candidateMs / 1000;
  const diff = Math.abs(localSec - candidateSec);
  return Math.max(0, 1 - Math.min(1, diff / 5));
}

function scoreCandidate(
  candidate: RecordingCandidate,
  tags: RawTags,
): number {
  // Tag-MBID candidates that verified against the MB graph are trusted fully.
  if (candidate.method === "tag_mbid") return TAG_VERIFIED_SCORE;

  const acoustidWeight = candidate.acoustidScore != null ? 0.4 : 0;
  const remainder = 1 - acoustidWeight;
  const titleWeight = 0.25 * remainder + (acoustidWeight === 0 ? 0.25 : 0);
  const artistWeight = 0.25 * remainder + (acoustidWeight === 0 ? 0.25 : 0);
  const durationWeight = 0.25 * remainder + (acoustidWeight === 0 ? 0.5 : 0);

  // Renormalise so weights sum to 1 even when acoustid is absent.
  const total = acoustidWeight + titleWeight + artistWeight + durationWeight;
  const w = (x: number) => x / total;

  const titleSim = stringSimilarity(candidate.title, tags.title);
  const artistSim = stringSimilarity(
    candidate.artistCredits[0]?.name ?? "",
    // Compare against the track artist (the performer the candidate represents),
    // not the album artist — a mistagged albumartist would unfairly penalise the
    // correct recording.
    tags.artistName,
  );
  const durSim = durationAgreement(tags.durationSeconds, candidate.durationMs);
  const acoust = candidate.acoustidScore ?? 0;

  return (
    w(acoustidWeight) * acoust +
    w(titleWeight) * titleSim +
    w(artistWeight) * artistSim +
    w(durationWeight) * durSim
  );
}

export function scoreCandidates(
  candidates: RecordingCandidate[],
  tags: RawTags,
): ScoredCandidate[] {
  const scored = candidates.map((c) => ({
    ...c,
    score: scoreCandidate(c, tags),
  }));

  // Signal agreement bonus: when independent methods point at the same
  // recording, both gain +0.1 (capped at 1.0). Useful for non-tag matches:
  // acoustid + search converging is a strong signal.
  const byMbid = new Map<string, ScoredCandidate[]>();
  for (const s of scored) {
    const list = byMbid.get(s.recordingMbid) ?? [];
    list.push(s);
    byMbid.set(s.recordingMbid, list);
  }
  for (const list of byMbid.values()) {
    const methods = new Set(list.map((c) => c.method));
    if (methods.size >= 2) {
      for (const c of list) {
        c.score = Math.min(1, c.score + 0.1);
      }
    }
  }
  return scored;
}

export function pickWinner(
  scored: ScoredCandidate[],
): ScoredCandidate | null {
  if (scored.length === 0) return null;
  return [...scored].sort((a, b) => b.score - a.score)[0]!;
}
