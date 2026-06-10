import { MIN_SEEDS, SEED_CAP } from "./constants.js";
export type { PlaylistSeedRow } from "../../db/queries/playlists.js";
import type { PlaylistSeedRow } from "../../db/queries/playlists.js";

// A seed addresses Last.fm's track.getSimilar by artist+title only. The local
// recording MBID is deliberately NOT carried here: Last.fm's similarity index has
// poor per-recording-MBID coverage (frequent "Track not found" / empty results),
// so name addressing is the reliable signal (mirrors resolution decision E4).
export interface Seed {
  title: string;
  artist: string;
}

/** Capped, recency-ordered seed set. Below MIN_SEEDS → [] (cold-start gate:
 * a brand-new / tiny playlist yields no suggestions). Newest-added first so
 * suggestions track the playlist's current direction (design §5). */
export function buildSeeds(rows: PlaylistSeedRow[]): Seed[] {
  if (rows.length < MIN_SEEDS) return [];
  return [...rows]
    .sort((a, b) => {
      const ta = a.addedAt ? a.addedAt.getTime() : 0;
      const tb = b.addedAt ? b.addedAt.getTime() : 0;
      return tb - ta;
    })
    .slice(0, SEED_CAP)
    .map((r) => ({ title: r.title, artist: r.artistName }));
}
