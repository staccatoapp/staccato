import { normalizeString } from "../musicbrainz/normalize.js";
import type {
  ReleaseCandidate,
  ResolvedRelease,
  ScoredCandidate,
  RawTags,
} from "./types.js";

const ALBUM_PRIMARY_TYPES = new Set(["Album"]);
const EXCLUDE_SECONDARY_TYPES = new Set([
  "Compilation",
  "Live",
  "Remix",
  "Soundtrack",
  "DJ-mix",
  "Mixtape/Street",
  "Demo",
  "Interview",
  "Spokenword",
  "Audiobook",
]);

const DIGITAL_FORMATS = new Set(["Digital Media", "Digital", "File"]);

function isAlbumRelease(r: ReleaseCandidate): boolean {
  if (!r.primaryType || !ALBUM_PRIMARY_TYPES.has(r.primaryType)) return false;
  if (r.secondaryTypes.some((t) => EXCLUDE_SECONDARY_TYPES.has(t)))
    return false;
  return true;
}

function parseYear(date: string | null): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}

function isDigitalSource(tags: RawTags): boolean {
  // Heuristic: lossless/lossy file with no physical media tags. We don't
  // currently extract media tags, so treat the typical home-library formats
  // as digital. SACD/DSD/etc would override; left for future refinement.
  const f = tags.fileFormat.toLowerCase();
  return (
    f === "flac" ||
    f === "mp3" ||
    f === "m4a" ||
    f === "aac" ||
    f === "opus" ||
    f === "vorbis" ||
    f === "ogg"
  );
}

// Returns the chosen release with a confidence score derived from how far
// down the disambiguation chain we had to walk to pick it.
export function pickRelease(
  winner: ScoredCandidate,
  tags: RawTags,
): ResolvedRelease | null {
  const releases = winner.releases;
  if (releases.length === 0) return null;

  // Step 1: file's own tags name a specific release MBID.
  if (tags.mbAlbumId) {
    const exact = releases.find((r) => r.releaseMbid === tags.mbAlbumId);
    if (exact) return toResolved(exact, 1.0);
  }

  // Step 1.5: the file's own album tag names a release title. User tagging is
  // strong evidence and — unlike the studio-album heuristic below — correctly
  // keeps compilations ("Greatest Hits") the file genuinely belongs to. Matching
  // here also makes every track in the folder converge on the same release group
  // (they share the album tag) instead of each picking its own studio album.
  if (tags.albumTitle) {
    const want = normalizeString(tags.albumTitle);
    const titleMatches = releases.filter(
      (r) => r.title && normalizeString(r.title) === want,
    );
    if (titleMatches.length > 0) {
      const officialMatches = titleMatches.filter(
        (r) => r.status === "Official",
      );
      const pool = officialMatches.length > 0 ? officialMatches : titleMatches;
      const yearMatched = tags.year
        ? pool.filter((r) => r.date?.startsWith(String(tags.year)))
        : [];
      const finalPool = yearMatched.length > 0 ? yearMatched : pool;
      const chosen = [...finalPool].sort((a, b) => {
        const da = a.date ?? "9999";
        const db = b.date ?? "9999";
        return da < db ? -1 : da > db ? 1 : 0;
      })[0]!;
      return toResolved(chosen, yearMatched.length > 0 ? 0.95 : 0.9);
    }
  }

  // Prefer Official status throughout.
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;

  // Step 2: prefer album-type releases without disqualifying secondary types.
  const albums = pool.filter(isAlbumRelease);
  if (albums.length === 1) return toResolved(albums[0]!, 0.8);
  const candidates = albums.length > 0 ? albums : pool;

  // Step 3: earliest release date.
  const sorted = [...candidates].sort((a, b) => {
    const da = a.date ?? "9999";
    const db = b.date ?? "9999";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const earliestDate = sorted[0]?.date ?? null;
  const dateTied = earliestDate
    ? sorted.filter((r) => r.date === earliestDate)
    : sorted;
  if (dateTied.length === 1) {
    return toResolved(dateTied[0]!, albums.length > 0 ? 0.7 : 0.6);
  }

  // Step 4: prefer release in the artist's original country (proxy: the
  // earliest-dated release's country wins for ties; failing that, prefer
  // releases with a country set over those without).
  const withCountry = dateTied.filter((r) => r.country);
  const countryPool = withCountry.length > 0 ? withCountry : dateTied;
  if (countryPool.length === 1) {
    return toResolved(countryPool[0]!, 0.5);
  }

  // Step 5: digital media preference if source is digital.
  let mediaPool = countryPool;
  if (isDigitalSource(tags)) {
    const digital = countryPool.filter((r) =>
      r.mediaFormats.some((f) => DIGITAL_FORMATS.has(f)),
    );
    if (digital.length > 0) mediaPool = digital;
  }
  if (mediaPool.length === 1) {
    return toResolved(mediaPool[0]!, 0.4);
  }

  // Final fallback: pick first remaining (effectively earliest album) and
  // record it as ambiguous via a low confidence score.
  return toResolved(mediaPool[0]!, 0.3);
}

function toResolved(r: ReleaseCandidate, confidence: number): ResolvedRelease {
  return {
    releaseMbid: r.releaseMbid,
    releaseGroupMbid: r.releaseGroupMbid,
    title: r.title,
    releaseYear: parseYear(r.date),
    confidence,
  };
}

// Convenience: pick a single canonical artist credit from the recording's
// artist-credit list. The first credit is the lead artist for the recording;
// the full list is preserved via track_artists for compilation support.
export function pickLeadArtist(winner: ScoredCandidate): {
  mbid: string;
  name: string;
} | null {
  const first = winner.artistCredits[0];
  if (!first) return null;
  return { mbid: first.mbid, name: first.name };
}

export function normalizeTitle(s: string): string {
  return normalizeString(s);
}
