import type { LastfmTag } from "../../../lastfm/types.js";

export type EntityLevel = "track" | "album" | "artist";

// Tunable (spec D7). Track tags describe the song; artist tags describe the
// whole catalogue and are the weakest hint — no hard artist fallback.
export const LEVEL_SPECIFICITY: Record<EntityLevel, number> = {
  track: 1.0,
  album: 0.6,
  artist: 0.3,
};

// Last.fm getTopTags `count` looks normalised toward 100 (verify in impl).
export const LASTFM_WEIGHT_DENOMINATOR = 100;

// A genre must clear this summed score or it is dropped as noise. If nothing
// clears it, the track is unclassified (null) — we never guess from artist.
export const MIN_GENRE_WEIGHT = 0.1;

export type GenreVector = Map<string, number>; // genre -> weight, sums to 1

export interface LeveledTags {
  track?: LastfmTag[];
  album?: LastfmTag[];
  artist?: LastfmTag[];
}

/**
 * Confidence-weighted genre blend (D7). Combines tags across Last.fm levels,
 * drops sub-threshold noise, normalises. Returns null when nothing clears the
 * threshold (unclassified — no artist-only guess).
 */
export function classifyTrackGenres(levels: LeveledTags): GenreVector | null {
  const scores = new Map<string, number>();
  for (const level of ["track", "album", "artist"] as const) {
    const tags = levels[level];
    if (!tags) continue;
    const specificity = LEVEL_SPECIFICITY[level];
    for (const tag of tags) {
      const name = tag.name.trim().toLowerCase();
      if (!name) continue;
      const contribution =
        (tag.weight / LASTFM_WEIGHT_DENOMINATOR) * specificity;
      scores.set(name, (scores.get(name) ?? 0) + contribution);
    }
  }

  for (const [genre, score] of scores) {
    if (score < MIN_GENRE_WEIGHT) scores.delete(genre);
  }
  if (scores.size === 0) return null;

  const total = [...scores.values()].reduce((a, b) => a + b, 0);
  const vector: GenreVector = new Map();
  for (const [genre, score] of scores) vector.set(genre, score / total);
  return vector;
}
