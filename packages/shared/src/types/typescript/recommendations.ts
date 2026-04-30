export interface RecommendedTrack {
  recordingMbid: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  releaseGroupMbid: string | null;
  coverArtUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
  inLibrary: boolean;
}

export interface RecommendedPlaylistTrack {
  recordingMbid: string | null;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  durationMs: number | null;
  coverArtUrl: string | null;
  inLibrary: boolean;
}

export interface RecommendedPlaylist {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  tracks: RecommendedPlaylistTrack[];
  coverArtUrl: string | null;
  expiresAt: string | null;
}
