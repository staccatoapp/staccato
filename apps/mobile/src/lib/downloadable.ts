/**
 * The shape the offline-download feature needs to pin a playlist or album to the
 * device. Built (purely) by the playlist/album view-models from the server
 * detail, consumed by the downloads store and the download button. Kept here —
 * neutral of both — so the pure view-models never import the store.
 */

/** One owned track to pull to the device. */
export interface DownloadableTrack {
  trackId: string;
  /** Source file extension → local download extension (e.g. "flac", "m4a"). */
  fileExtension: string | null;
  coverArtUrl: string | null;
}

/**
 * A playlist or album whose owned audio + cover art can be pinned for offline
 * play. `snapshot` is the opaque server-detail JSON persisted so the collection
 * can later be rendered with no network (Phase 2 consumes it).
 */
export interface DownloadableCollection {
  id: string;
  kind: "playlist" | "album";
  name: string;
  coverArtUrls: string[];
  tracks: DownloadableTrack[];
  snapshot: unknown;
}
