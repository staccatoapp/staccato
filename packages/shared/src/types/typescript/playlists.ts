export type PlaylistListItem = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  coverArtUrl: string | null;
  updatedAt: string | null;
};

export type PlaylistTrack = {
  entryId: string;
  trackId: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  albumId: string;
  coverArtUrl: string | null;
  durationSeconds: number | null;
  trackNumber: number | null;
  position: number;
};

export type PlaylistDetail = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
  tracks: PlaylistTrack[];
};
