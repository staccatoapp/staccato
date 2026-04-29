export type AlbumListItem = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  releaseYear: number | null;
  coverArtUrl: string | null;
  createdAt: string | null;
};

export type AlbumTrack = {
  id: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
};

export type AlbumDetail = {
  album: AlbumListItem;
  tracks: AlbumTrack[];
};
