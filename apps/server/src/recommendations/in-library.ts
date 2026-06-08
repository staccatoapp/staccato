import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";
import {
  getLibraryTracksByArtistMbids,
  getLocalTrackMbidsByMbids,
  getTracksByMusicbrainzIds,
} from "../db/queries/tracks.js";
import { normalizeString } from "../musicbrainz/normalize.js";

// A track may be owned as a *different MusicBrainz recording* than the one a
// recommendation source resolved to (the importer matches by AcoustID; sources
// match by their own MBID or by name search). When the exact recording-MBID
// lookup misses, fall back to a song-level identity match on
// (artistMbid, normalized title) against the library's locally stored titles —
// conservative enough to exclude remixes/live cuts ("3005" ≠ "3005 (Friction
// Remix)") while catching the same song held under another recording id. Shared
// by every recommendation source through the serve-time passes below.
// NUL separator: can't occur in an MBID or a normalized title, so the
// composite key is collision-free (a space could be ambiguous).
const SONG_KEY_SEP = "\u0000";
function songKey(artistMbid: string, title: string): string {
  return `${artistMbid}${SONG_KEY_SEP}${normalizeString(title)}`;
}

/** Build a (artistMbid, normalized title) → local trackId index for the
 * recommendation tracks that missed the exact recording-MBID match. Only tracks
 * carrying an artistMbid can participate (the key requires it), so a source that
 * omits artist MBIDs simply gets no fallback. Each library track is indexed under
 * BOTH its raw tag title and its MusicBrainz canonical title (these often
 * disagree — e.g. "3005" vs "V. 3005" — and the source may have used either
 * form). One DB query over the distinct artists in the miss set; first owned copy
 * of a song wins deterministically. */
function buildSongIndex(
  unmatched: { artistMbid: string | null }[],
): Map<string, string> {
  const index = new Map<string, string>();
  const artistMbids = [
    ...new Set(
      unmatched
        .map((t) => t.artistMbid)
        .filter((m): m is string => m !== null && m !== ""),
    ),
  ];
  if (artistMbids.length === 0) return index;
  for (const row of getLibraryTracksByArtistMbids(artistMbids)) {
    for (const title of [row.title, row.canonicalTitle]) {
      if (!title) continue;
      const key = songKey(row.artistMbid, title);
      if (!index.has(key)) index.set(key, row.trackId);
    }
  }
  return index;
}

// inLibrary is not safe to cache: a track can transition into the local
// library at any point (download completion, library scan, manual import).
// Re-resolve from the live DB on every serve so the user sees the truth.
export function refreshTracksInLibrary(
  tracks: RecommendedTrack[],
): RecommendedTrack[] {
  if (tracks.length === 0) return tracks;
  const localSet = new Set(
    getLocalTrackMbidsByMbids(tracks.map((t) => t.recordingMbid)),
  );
  // Song-level fallback only for the tracks the exact MBID match missed.
  const unmatched = tracks.filter(
    (t) => !localSet.has(t.recordingMbid) && t.artistMbid,
  );
  const songIndex = buildSongIndex(unmatched);
  return tracks.map((t) => {
    if (localSet.has(t.recordingMbid)) return { ...t, inLibrary: true };
    if (t.artistMbid && songIndex.has(songKey(t.artistMbid, t.title))) {
      return { ...t, inLibrary: true };
    }
    return { ...t, inLibrary: false };
  });
}

export function refreshPlaylistsInLibrary(
  playlists: RecommendedPlaylist[],
): RecommendedPlaylist[] {
  if (playlists.length === 0) return playlists;
  const allMbids: string[] = [];
  for (const p of playlists) {
    for (const t of p.tracks) {
      if (t.recordingMbid) allMbids.push(t.recordingMbid);
    }
  }
  const localMap =
    allMbids.length === 0
      ? new Map()
      : getTracksByMusicbrainzIds(allMbids);

  // Song-level fallback only for the tracks the exact MBID match missed.
  const unmatched = playlists.flatMap((p) =>
    p.tracks.filter(
      (t) =>
        !(t.recordingMbid && localMap.has(t.recordingMbid)) && t.artistMbid,
    ),
  );
  const songIndex = buildSongIndex(unmatched);

  return playlists.map((p) => ({
    ...p,
    tracks: p.tracks.map((t) => {
      const local = t.recordingMbid ? localMap.get(t.recordingMbid) : undefined;
      if (local) return { ...t, inLibrary: true, localTrackId: local.trackId };
      if (t.artistMbid) {
        const trackId = songIndex.get(songKey(t.artistMbid, t.title));
        if (trackId) return { ...t, inLibrary: true, localTrackId: trackId };
      }
      return { ...t, inLibrary: false, localTrackId: null };
    }),
  }));
}
