import type { FastifyBaseLogger } from "fastify";
import type { HeardIndex } from "./heard.js";

/** Shared by every affinity type. `weight` is the normalised relative share
 * (each score ÷ the type's total, summing to 1.0) — it is *relative*, so a thin
 * history still shows high weight on its one or two entries; therefore weight can
 * only ORDER / proportion, never gate. `effectiveRecentTracks` is the *absolute*
 * recency-decayed count of DISTINCT contributing tracks, so it is the GATE
 * (cold-start + relevance + currency in one number): one repeated track can't
 * mint a mix (breadth), and an abandoned entity fades (recency). See spec §4/§6,
 * decision E8. */
export interface Affinity {
  weight: number;
  effectiveRecentTracks: number;
}
export interface GenreAffinity extends Affinity {
  genre: string;
}
export interface ArtistAffinity extends Affinity {
  artistName: string;
  artistMbid: string | null;
}
export interface AlbumAffinity extends Affinity {
  albumId: string;
  albumTitle: string;
}
export interface DecadeAffinity extends Affinity {
  decade: number; // e.g. 2000
}
export interface AdjacencySet {
  tags: string[];
  artists: string[];
}

/** The per-user taste profile, recomputed each refresh (not persisted). */
export interface TasteProfile {
  userId: string;
  // All affinity vectors are normalised and sorted by weight descending (the
  // `topNormalised` helper in the listening-history extractor guarantees this),
  // so consumers can take the dominant entries by slicing from the front.
  genreAffinity: GenreAffinity[];
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
