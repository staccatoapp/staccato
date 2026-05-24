import type { AlbumArtistCredit } from "../zod/api/credits.js";

export type AlbumListItem = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  // Full ordered release-level credit list (lead + co-owners + guests) used to
  // render the linked "A & B" credit line. Empty when album_artists has not
  // been populated yet; callers fall back to artistName.
  artists: AlbumArtistCredit[];
  releaseYear: number | null;
  coverArtUrl: string | null;
  createdAt: string | null;
  confidenceScore: number | null;
  pendingTrackCount: number;
};
