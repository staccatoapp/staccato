import type { Evidence, RecordingCandidate } from "../types.js";
import { lookupRecordingRich } from "../mbLookup.js";

// Trust embedded MusicBrainz recording MBIDs (e.g. from Picard). Verify the
// MBID resolves on MB and return the full graph context. If the lookup fails
// the candidate is omitted — other generators may still produce a winner.
export async function candidatesFromTags(
  evidence: Evidence,
): Promise<RecordingCandidate[]> {
  const mbid = evidence.tags.mbRecordingId;
  if (!mbid) return [];
  const candidate = await lookupRecordingRich(mbid, "tag_mbid", null);
  return candidate ? [candidate] : [];
}
