import { acoustidApiKey, lookupFingerprint } from "../evidence/acoustid.js";
import type { Evidence, RecordingCandidate } from "../types.js";

const MAX_ACOUSTID_CANDIDATES = 3;

// Build candidates directly from AcoustID's inline recording metadata — no
// per-candidate MusicBrainz lookup. Releases are left empty; the resolver
// enriches only the winning candidate with the full release graph (one MB call)
// before release disambiguation. Scoring only needs title/artist/duration/score,
// all of which AcoustID returns inline.
export async function candidatesFromAcoustid(
  evidence: Evidence,
): Promise<RecordingCandidate[]> {
  const apiKey = acoustidApiKey();
  if (!apiKey) return [];
  if (!evidence.fingerprint || evidence.fingerprintDuration == null) return [];

  const matches = await lookupFingerprint(
    evidence.fingerprintDuration,
    evidence.fingerprint,
    apiKey,
  );
  if (matches.length === 0) return [];

  // Beyond the top few the score has usually collapsed below viability.
  const top = [...matches]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ACOUSTID_CANDIDATES);

  return top.map((m) => ({
    method: "acoustid" as const,
    recordingMbid: m.recordingMbid,
    title: m.title ?? "",
    durationMs: m.durationSec != null ? m.durationSec * 1000 : null,
    artistCredits: m.artists.map((a) => ({
      mbid: a.mbid,
      name: a.name,
      joinPhrase: a.joinPhrase,
    })),
    releases: [],
    acoustidScore: m.score,
  }));
}
