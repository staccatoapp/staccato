import type {
  RecommendedPlaylist,
  RecommendedTrack,
} from "@staccato/shared";
import {
  getLocalTrackMbidsByMbids,
  getTracksByMusicbrainzIds,
} from "../db/queries/tracks.js";

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
  return tracks.map((t) => ({
    ...t,
    inLibrary: localSet.has(t.recordingMbid),
  }));
}

export function refreshPlaylistsInLibrary(
  playlists: RecommendedPlaylist[],
): RecommendedPlaylist[] {
  const allMbids: string[] = [];
  for (const p of playlists) {
    for (const t of p.tracks) {
      if (t.recordingMbid) allMbids.push(t.recordingMbid);
    }
  }
  if (allMbids.length === 0) return playlists;
  const localMap = getTracksByMusicbrainzIds(allMbids);
  return playlists.map((p) => ({
    ...p,
    tracks: p.tracks.map((t) => {
      if (!t.recordingMbid) return t;
      const local = localMap.get(t.recordingMbid);
      if (!local) return { ...t, inLibrary: false, localTrackId: null };
      return { ...t, inLibrary: true, localTrackId: local.trackId };
    }),
  }));
}
