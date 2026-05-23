import type { TrackArtistCredit } from "../zod/api/credits.js";

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
  artists: TrackArtistCredit[];
};

export type TrackSearchResult = Omit<TrackListItem, "artistId" | "fileFormat">;
