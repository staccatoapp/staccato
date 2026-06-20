import type {
  AlbumArtistCredit,
  TrackArtistCredit,
  UnifiedAlbumDetail,
} from "@staccato/shared";

import type { TrackRowTrack } from "@/components/explore/track-row";
import type { DownloadableCollection } from "@/lib/downloadable";

/**
 * Pure view-model helpers for the album-detail screen. Availability is
 * **album-level** (the API exposes a `pendingTrackCount` for local albums and
 * no per-track ownership for external ones), so the screen surfaces a single
 * chip + a single album-level Lidarr request rather than per-track state.
 */
export type AlbumAvailability =
  | { kind: "inLibrary" }
  | { kind: "partial"; localCount: number; total: number }
  | { kind: "external" };

export function getAlbumAvailability(
  detail: UnifiedAlbumDetail,
): AlbumAvailability {
  if (detail.source === "external") return { kind: "external" };
  const total = detail.tracks.length;
  const pending = detail.album.pendingTrackCount;
  if (pending > 0) {
    return { kind: "partial", localCount: Math.max(0, total - pending), total };
  }
  return { kind: "inLibrary" };
}

/** Total runtime in seconds (local durations are seconds, external are ms). */
export function albumTotalSeconds(detail: UnifiedAlbumDetail): number {
  if (detail.source === "local") {
    return detail.tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  }
  return detail.tracks.reduce(
    (sum, t) => sum + (t.durationMs != null ? t.durationMs / 1000 : 0),
    0,
  );
}

/** "47 min" under an hour, "1 hr 12 min" beyond it. */
export function albumDurationLabel(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/** "11 songs · 39 min". */
export function albumMetaLabel(detail: UnifiedAlbumDetail): string {
  const count = detail.tracks.length;
  const songs = `${count} ${count === 1 ? "song" : "songs"}`;
  return `${songs} · ${albumDurationLabel(albumTotalSeconds(detail))}`;
}

/** Uppercase eyebrow line: year (local) or "Type · year" (external). */
export function albumEyebrow(detail: UnifiedAlbumDetail): string {
  if (detail.source === "local") {
    return detail.album.releaseYear != null
      ? String(detail.album.releaseYear)
      : "";
  }
  return [detail.album.releaseType, detail.album.releaseYear]
    .filter((v) => v != null && v !== "")
    .join(" · ");
}

/**
 * Track ids that can be played in full. Local albums own every returned track;
 * external (MusicBrainz-only) albums own none, so they're preview-only.
 */
export function playableTrackIds(detail: UnifiedAlbumDetail): string[] {
  if (detail.source === "local") return detail.tracks.map((t) => t.id);
  return [];
}

/** Join an ordered credit list into "A & B feat. C" using each join phrase. */
function joinArtistCredits(
  artists: (AlbumArtistCredit | TrackArtistCredit)[],
): string {
  return [...artists]
    .sort((a, b) => a.position - b.position)
    .map(
      (a, i, arr) => a.name + (i < arr.length - 1 ? (a.joinPhrase ?? "") : ""),
    )
    .join("");
}

export interface AlbumTrackRow {
  track: TrackRowTrack;
  /** 1-based position shown in the index column. */
  index: number;
  durationSeconds: number | null;
}

/** Map an album's tracklist onto the shared {@link TrackRowTrack} shape. */
export function albumTrackRows(detail: UnifiedAlbumDetail): AlbumTrackRow[] {
  const { coverArtUrl, artistName } = albumDisplay(detail);

  if (detail.source === "local") {
    return detail.tracks.map((t, i) => {
      const credited = joinArtistCredits(t.artists);
      return {
        index: t.trackNumber ?? i + 1,
        durationSeconds: t.durationSeconds,
        track: {
          recordingMbid: t.recordingMbid ?? "",
          title: t.title,
          subtitle: credited && credited !== artistName ? credited : "",
          coverArtUrl,
          inLibrary: true,
          localTrackId: t.id,
          artistName,
        },
      };
    });
  }

  return detail.tracks.map((t, i) => ({
    index: t.trackPosition || i + 1,
    durationSeconds:
      t.durationMs != null ? Math.round(t.durationMs / 1000) : null,
    track: {
      recordingMbid: t.recordingMbid,
      title: t.title,
      subtitle: "",
      coverArtUrl,
      inLibrary: false,
      localTrackId: null,
      artistName,
    },
  }));
}

/**
 * Build the offline-download descriptor for a **local** album (owns its tracks),
 * or null for an external one (no audio to download). The raw detail is the
 * persisted snapshot for offline rendering (Phase 2).
 */
export function albumDownloadable(
  detail: UnifiedAlbumDetail,
): DownloadableCollection | null {
  if (detail.source !== "local") return null;
  const { coverArtUrl } = albumDisplay(detail);
  return {
    id: detail.album.id,
    kind: "album",
    name: detail.album.title,
    coverArtUrls: coverArtUrl ? [coverArtUrl] : [],
    tracks: detail.tracks.map((t) => ({
      trackId: t.id,
      fileExtension: t.fileExtension,
      coverArtUrl,
    })),
    snapshot: detail,
  };
}

/** Cover + display artist common to both album sources. */
export function albumDisplay(detail: UnifiedAlbumDetail): {
  coverArtUrl: string | null;
  artistName: string;
} {
  return {
    coverArtUrl: detail.album.coverArtUrl,
    artistName: detail.album.artistName,
  };
}
