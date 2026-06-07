import type { FastifyBaseLogger } from "fastify";
import type { HeardIndex } from "./heard.js";

export interface GenreAffinity {
  genre: string;
  weight: number;
}
export interface ArtistAffinity {
  artistName: string;
  artistMbid: string | null;
  weight: number;
}
export interface AlbumAffinity {
  albumId: string;
  albumTitle: string;
  weight: number;
}
export interface DecadeAffinity {
  decade: number; // e.g. 2000
  weight: number;
}
export interface AdjacencySet {
  tags: string[];
  artists: string[];
}

/** The per-user taste profile, recomputed each refresh (not persisted). */
export interface TasteProfile {
  userId: string;
  genreAffinity: GenreAffinity[]; // normalised, descending
  artistAffinity: ArtistAffinity[];
  albumAffinity: AlbumAffinity[];
  decadeAffinity: DecadeAffinity[];
  adjacency: AdjacencySet;
  heard: HeardIndex;
  computedAt: number;
}

/** What a single signal extractor contributes. Everything optional so future
 * extractors (e.g. demographics) only fill the slices they own. */
export type PartialProfile = Partial<
  Pick<
    TasteProfile,
    | "genreAffinity"
    | "artistAffinity"
    | "albumAffinity"
    | "decadeAffinity"
    | "adjacency"
    | "heard"
  >
>;

/** Shared tools handed to every extractor. */
export interface ProfileContext {
  log: FastifyBaseLogger;
  now: number;
}

/** The future-metrics seam (spec §6). v1 ships exactly one: listening-history. */
export interface SignalExtractor {
  readonly id: string;
  isEligible?(userId: string): boolean;
  extract(userId: string, ctx: ProfileContext): Promise<PartialProfile>;
}
