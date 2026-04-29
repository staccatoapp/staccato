export type TrackListItem = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  albumId: string | null;
  albumTitle: string | null;
  coverArtUrl: string | null;
  durationSeconds: number | null;
  fileFormat: string | null;
};

export type TrackSearchResult = Omit<TrackListItem, "artistId" | "fileFormat">;
