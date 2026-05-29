// Pure helpers + draft models for the Edit Album dialog. Kept separate from the
// component so they can be unit-tested without a DOM. The draft credit model
// mirrors MusicBrainz semantics: `artists` is an ordered list where each
// credit's `joinPhrase` is the connector placed *after* it (e.g. " feat. ",
// " & "); the last credit's joinPhrase is unused.
import type { AlbumEditRequest, TrackArtistCredit } from "@staccato/shared";

export interface DraftAlbum {
  title: string;
  artistName: string;
  releaseYear: number | null;
  coverArtUrl: string | null;
}

export interface DraftCredit {
  name: string;
  joinPhrase: string | null;
}

export interface DraftTrack {
  id: string;
  n: number; // track number within its disc
  disc: number;
  title: string;
  dur: number; // seconds
  artists: DraftCredit[];
}

// Source rows from GET /api/albums/:albumKey (local source).
export interface SourceTrack {
  id: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  artists: TrackArtistCredit[];
}

// Normalize a track's credits into the ordered draft model. Falls back to a
// single credit naming the album artist when a track carries no credits, so the
// editor always has at least one row to show.
export function normalizeCredits(
  artists: TrackArtistCredit[],
  fallbackName: string,
): DraftCredit[] {
  if (artists.length > 0) {
    return [...artists]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ name: a.name, joinPhrase: a.joinPhrase }));
  }
  return [{ name: fallbackName, joinPhrase: null }];
}

export function toDraftTrack(
  t: SourceTrack,
  fallbackArtist: string,
): DraftTrack {
  return {
    id: t.id,
    n: t.trackNumber ?? 0,
    disc: t.discNumber ?? 1,
    title: t.title,
    dur: t.durationSeconds ?? 0,
    artists: normalizeCredits(t.artists, fallbackArtist),
  };
}

// Render an ordered credit list to a display string, e.g. "A feat. B & C".
// Uses the *previous* credit's joinPhrase as the connector; falls back to "·".
export function creditString(credits: DraftCredit[]): string {
  const named = credits.filter((c) => c.name.trim() !== "");
  return named
    .map((c, i) =>
      i === 0
        ? c.name
        : `${(named[i - 1]?.joinPhrase ?? "").trim() || "·"} ${c.name}`,
    )
    .join(" ");
}

// Renumber each disc 1..n in current array order. Used after reorder, remove,
// disc reassignment, or add.
export function renumberTracks(tracks: DraftTrack[]): DraftTrack[] {
  const counters = new Map<number, number>();
  return tracks.map((t) => {
    const next = (counters.get(t.disc) ?? 0) + 1;
    counters.set(t.disc, next);
    return { ...t, n: next };
  });
}

// Move an array item from one index to another (immutable).
export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

// Count of changed fields between the original album+tracks and the draft.
// Drives the footer indicator and Save's enabled state. Counts: album title,
// artistName, releaseYear, coverArtUrl; per-track n, disc, title, credit
// string; plus added and removed tracks.
export function computeDirty(
  originalAlbum: DraftAlbum,
  originalTracks: DraftTrack[],
  album: DraftAlbum,
  tracks: DraftTrack[],
): number {
  let n = 0;
  if ((originalAlbum.title ?? "") !== (album.title ?? "")) n++;
  if ((originalAlbum.artistName ?? "") !== (album.artistName ?? "")) n++;
  if (
    String(originalAlbum.releaseYear ?? "") !== String(album.releaseYear ?? "")
  )
    n++;
  if ((originalAlbum.coverArtUrl ?? "") !== (album.coverArtUrl ?? "")) n++;

  const byId = new Map(originalTracks.map((t) => [t.id, t]));
  for (const t of tracks) {
    const o = byId.get(t.id);
    if (!o) {
      n++; // added track
      continue;
    }
    if (o.n !== t.n) n++;
    if (o.disc !== t.disc) n++;
    if ((o.title ?? "") !== (t.title ?? "")) n++;
    if (creditString(o.artists) !== creditString(t.artists)) n++;
  }

  const presentIds = new Set(tracks.map((t) => t.id));
  for (const o of originalTracks) {
    if (!presentIds.has(o.id)) n++; // removed track
  }
  return n;
}

// Map the draft into the shared save contract. Empty-named credits are dropped
// and positions are re-derived from order.
export function buildEditPayload(
  album: DraftAlbum,
  tracks: DraftTrack[],
): AlbumEditRequest {
  return {
    title: album.title,
    artistName: album.artistName,
    releaseYear: album.releaseYear,
    coverArtUrl: album.coverArtUrl,
    tracks: tracks.map((t) => ({
      trackId: t.id,
      title: t.title,
      trackNumber: t.n,
      discNumber: t.disc,
      artists: t.artists
        .filter((a) => a.name.trim() !== "")
        .map((a, position) => ({
          name: a.name,
          joinPhrase: a.joinPhrase,
          position,
        })),
    })),
  };
}

export const JOIN_PHRASES = ["feat.", "&", ",", "with", "vs.", "x"];
