import { type GradientKey } from "@staccato/shared";

export interface HomeAlbum {
  id: string;
  title: string;
  artistName: string;
  releaseYear: number;
  gradientKey: GradientKey;
  artUrl: string | null;
}

export interface HomePlaylist {
  id: string;
  name: string;
  trackCount: number;
  gradientKey: GradientKey;
  /** Up to 4 dominant cover arts; 4 render as a mosaic, fewer as a single tile. */
  artUrls: string[];
}

export interface HomeRecPlaylist {
  id: string;
  name: string;
  trackCount: number;
  artistSummary: string;
  gradientKey: GradientKey;
  artUrl: string | null;
  /** Up to 4 unique track cover arts; 4 render as a mosaic, fewer fall back to `artUrl`. */
  artUrls?: string[];
}
