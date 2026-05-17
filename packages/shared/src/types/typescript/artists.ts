export type Artist = {
  id: string;
  name: string;
  imageUrl: string | null;
  createdAt: string | null;
  albumCount: number;
};

export type ArtistSearchItem = {
  id: string;
  name: string;
  imageUrl: string | null;
};
