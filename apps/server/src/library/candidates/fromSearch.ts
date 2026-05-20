import type { Evidence, RecordingCandidate } from "../types.js";
import { searchRecordingsRich } from "../mbLookup.js";

function escapeLuceneTerm(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

// Strip trailing bracketed annotations like "[Hidden]" or "(Bonus Track)" that
// are not part of the canonical recording title and break MusicBrainz's Lucene
// phrase match. Conservative: only trailing groups, applied repeatedly so
// "Song [Hidden] (Live)" reduces to "Song". Never returns empty.
function sanitizeTitleForSearch(title: string): string {
  let out = title;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\s*[[(][^[\]()]*[\])]\s*$/, "").trim();
  } while (out !== prev && out.length > 0);
  return out || title;
}

export async function candidatesFromSearch(
  evidence: Evidence,
): Promise<RecordingCandidate[]> {
  const { tags } = evidence;
  const title = tags.title;
  // Recording search keys on the *track* artist (who performed the song), not
  // the album artist — a mistagged or compilation albumartist must not poison
  // the lookup.
  const artist = tags.artistName;
  if (!title || !artist) return [];

  const safeArtist = escapeLuceneTerm(artist);
  const cleanedTitle = sanitizeTitleForSearch(title);
  const titleVariants =
    cleanedTitle !== title ? [title, cleanedTitle] : [title];

  // Try the most specific query first (raw title + release filter), falling
  // back to looser variants. The cleaned title rescues junk-suffixed tags.
  const queries: string[] = [];
  for (const t of titleVariants) {
    const safeTitle = escapeLuceneTerm(t);
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
  }

  for (const q of queries) {
    const results = await searchRecordingsRich(q);
    if (results.length > 0) {
      return results.map((r) => r.candidate);
    }
  }
  return [];
}
