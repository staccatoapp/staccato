import type { Evidence, RecordingCandidate } from "../types.js";
import { searchRecordingsRich } from "../mbLookup.js";

function escapeLuceneTerm(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

export async function candidatesFromSearch(
  evidence: Evidence,
): Promise<RecordingCandidate[]> {
  const { tags } = evidence;
  const title = tags.title;
  const artist = tags.albumArtist ?? tags.artistName;
  if (!title || !artist) return [];

  const safeTitle = escapeLuceneTerm(title);
  const safeArtist = escapeLuceneTerm(artist);

  const queries: string[] = [];
  if (tags.albumTitle) {
    queries.push(
      `artist:"${safeArtist}" AND recording:"${safeTitle}" AND release:"${escapeLuceneTerm(
        tags.albumTitle,
      )}" AND video:false`,
    );
  }
  queries.push(
    `artist:"${safeArtist}" AND recording:"${safeTitle}" AND video:false`,
  );

  for (const q of queries) {
    const results = await searchRecordingsRich(q);
    if (results.length > 0) {
      return results.map((r) => r.candidate);
    }
  }
  return [];
}
