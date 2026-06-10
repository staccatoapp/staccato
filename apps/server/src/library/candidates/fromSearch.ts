import type { Evidence, RecordingCandidate } from "../types.js";
import { searchRecordingsRich } from "../mbLookup.js";

export function escapeLuceneTerm(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

// Strip trailing bracketed annotations like "[Hidden]" or "(Bonus Track)" that
// are not part of the canonical recording title and break MusicBrainz's Lucene
// phrase match. Conservative: only trailing groups, applied repeatedly so
// "Song [Hidden] (Live)" reduces to "Song". Never returns empty.
export function sanitizeTitleForSearch(title: string): string {
  let out = title;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\s*[[(][^[\]()]*[\])]\s*$/, "").trim();
  } while (out !== prev && out.length > 0);
  return out || title;
}

/** Evidence-free recording search by name. Builds the same Lucene query cascade
 * the importer uses (artist + recording [+ release], with cleaned-title fallback
 * variants) and returns the candidates from the first query that yields results.
 *
 * Shared by the importer's {@link candidatesFromSearch} adapter and the in-house
 * recommendations resolution pass, which name-resolves Last.fm candidates lacking
 * an MBID (recs spec §5). Returns [] when artist or title is missing. */
export async function resolveRecordingByName(q: {
  artist: string;
  title: string;
  album?: string | null;
}): Promise<RecordingCandidate[]> {
  const { artist, title, album } = q;
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
    if (album) {
      queries.push(
        `artist:"${safeArtist}" AND recording:"${safeTitle}" AND release:"${escapeLuceneTerm(
          album,
        )}" AND video:false`,
      );
    }
    queries.push(
      `artist:"${safeArtist}" AND recording:"${safeTitle}" AND video:false`,
    );
  }

  for (const queryStr of queries) {
    const results = await searchRecordingsRich(queryStr);
    if (results.length > 0) {
      return results.map((r) => r.candidate);
    }
  }
  return [];
}

export async function candidatesFromSearch(
  evidence: Evidence,
): Promise<RecordingCandidate[]> {
  const { tags } = evidence;
  // Recording search keys on the *track* artist (who performed the song), not
  // the album artist — a mistagged or compilation albumartist must not poison
  // the lookup.
  return resolveRecordingByName({
    artist: tags.artistName,
    title: tags.title,
    album: tags.albumTitle,
  });
}
