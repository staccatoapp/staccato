import type {
  PlaylistDetail,
  PlaylistSource,
  RecommendedPlaylist,
  RecommendedPlaylistTrack,
} from "@staccato/shared";

import type { LidarrSubject } from "@/components/explore/add-album-sheet";
import type { TrackRowTrack } from "@/components/explore/track-row";
import type { DownloadableCollection } from "@/lib/downloadable";

/**
 * Pure view-model helpers for the shared playlist-detail screen. Two sources
 * feed the same `PlaylistView`: a saved **in-library** playlist (`PlaylistDetail`,
 * every track owned) and a **recommended** playlist from Explore
 * (`RecommendedPlaylist`, some tracks owned and the rest requestable via Lidarr).
 * Keeping the mapping here (and tested) lets the components stay source-agnostic.
 */
export type PlaylistMode = "recommended" | "inLibrary";

export interface PlaylistTrackRow {
  track: TrackRowTrack;
  /** 1-based position shown in the index column. */
  index: number;
  durationSeconds: number | null;
  /**
   * Lidarr request payload for a not-in-library row that has the MBIDs, else
   * null. Drives the per-track request affordance on a recommended playlist.
   */
  requestSubject: LidarrSubject | null;
}

export interface PlaylistView {
  mode: PlaylistMode;
  id: string;
  name: string;
  description: string | null;
  /** Single cover (recommended playlists expose one resolved cover). */
  coverArtUrl: string | null;
  /** Up to 4 covers for a mosaic (in-library playlists); empty when single. */
  coverArtUrls: string[];
  /** Uppercase eyebrow source label, e.g. "ListenBrainz"; null for in-library. */
  source: string | null;
  total: number;
  localCount: number;
  totalSeconds: number;
  rows: PlaylistTrackRow[];
  /** Owned track ids, in order, for whole-playlist queueing. */
  playableTrackIds: string[];
}

/** Human label for a recommended playlist's source. */
function sourceLabel(source: PlaylistSource): string {
  return source === "listenbrainz" ? "ListenBrainz" : "Staccato";
}

/**
 * Lidarr request subject for a not-in-library recommended track, or null when it
 * can't be requested (owned, or missing the release-group/artist MBIDs). Built
 * inline (rather than importing the component helper) to keep this module pure.
 */
function requestSubjectFor(t: RecommendedPlaylistTrack): LidarrSubject | null {
  if (t.inLibrary || !t.releaseGroupMbid || !t.artistMbid || !t.artistName) {
    return null;
  }
  return {
    releaseGroupMbid: t.releaseGroupMbid,
    artistMbid: t.artistMbid,
    artistName: t.artistName,
    albumTitle: t.albumTitle,
    coverArtUrl: t.coverArtUrl,
    title: t.title,
  };
}

/** "47 min" under an hour, "1 hr 12 min" beyond it. */
export function playlistDurationLabel(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/** "14 songs · 52 min". */
export function playlistMetaLabel(view: PlaylistView): string {
  const songs = `${view.total} ${view.total === 1 ? "song" : "songs"}`;
  return `${songs} · ${playlistDurationLabel(view.totalSeconds)}`;
}

/** Map a recommended playlist (mixed ownership) onto the shared view model. */
export function playlistViewFromRecommended(
  p: RecommendedPlaylist,
): PlaylistView {
  const rows: PlaylistTrackRow[] = p.tracks.map((t, i) => {
    const subtitle = t.inLibrary
      ? [t.artistName, t.albumTitle].filter(Boolean).join(" · ")
      : `${t.artistName ?? "Unknown Artist"} · Not in library`;
    return {
      index: i + 1,
      durationSeconds:
        t.durationMs != null ? Math.round(t.durationMs / 1000) : null,
      requestSubject: requestSubjectFor(t),
      track: {
        recordingMbid: t.recordingMbid ?? "",
        title: t.title,
        subtitle,
        coverArtUrl: t.coverArtUrl,
        inLibrary: t.inLibrary,
        localTrackId: t.localTrackId,
        artistName: t.artistName ?? "",
      },
    };
  });

  return {
    mode: "recommended",
    id: p.id,
    name: p.name,
    description: p.description,
    coverArtUrl: p.coverArtUrl,
    coverArtUrls: [],
    source: sourceLabel(p.source),
    total: p.tracks.length,
    localCount: p.tracks.filter((t) => t.inLibrary).length,
    totalSeconds: p.tracks.reduce(
      (sum, t) => sum + (t.durationMs != null ? t.durationMs / 1000 : 0),
      0,
    ),
    rows,
    playableTrackIds: p.tracks
      .filter((t) => t.inLibrary && t.localTrackId != null)
      .map((t) => t.localTrackId as string),
  };
}

/** Map a saved in-library playlist (all tracks owned) onto the view model. */
export function playlistViewFromLibrary(p: PlaylistDetail): PlaylistView {
  const rows: PlaylistTrackRow[] = p.tracks.map((t, i) => ({
    index: i + 1,
    durationSeconds: t.durationSeconds,
    requestSubject: null,
    track: {
      // Owned tracks never hit the preview path; recordingMbid is only a
      // gradient seed / row key, so fall back to the stable track id when the
      // MusicBrainz id is unknown.
      recordingMbid: t.recordingMbid ?? t.trackId,
      title: t.title,
      subtitle: t.artistName ?? "",
      coverArtUrl: t.coverArtUrl,
      inLibrary: true,
      localTrackId: t.trackId,
      artistName: t.artistName ?? "",
    },
  }));

  return {
    mode: "inLibrary",
    id: p.id,
    name: p.name,
    description: p.description,
    coverArtUrl: null,
    coverArtUrls: p.coverArtUrls,
    source: null,
    total: p.tracks.length,
    localCount: p.tracks.length,
    totalSeconds: p.tracks.reduce(
      (sum, t) => sum + (t.durationSeconds ?? 0),
      0,
    ),
    rows,
    playableTrackIds: p.tracks.map((t) => t.trackId),
  };
}

/**
 * Build the offline-download descriptor for an in-library playlist. Every track
 * is owned, so all are downloadable; the raw detail is the persisted snapshot so
 * the collection can be rendered offline later (Phase 2).
 */
export function playlistDownloadable(
  p: PlaylistDetail,
): DownloadableCollection {
  return {
    id: p.id,
    kind: "playlist",
    name: p.name,
    coverArtUrls: p.coverArtUrls,
    tracks: p.tracks.map((t) => ({
      trackId: t.trackId,
      fileExtension: t.fileExtension,
      coverArtUrl: t.coverArtUrl,
    })),
    snapshot: p,
  };
}
