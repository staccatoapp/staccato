import type { TasteProfile } from "../profile/types.js";
import type {
  Candidate,
  Generator,
  GeneratorContext,
  PlaylistSpec,
} from "./types.js";

// Tunable starting values — tune against real yield/relevance data (recs spec §7.4).
export const GENRE_MIX_MIN_RECENT_TRACKS = 3;
export const GENRE_MIX_MAX_GENRES = 3;
export const GENRE_MIX_TARGET_TRACKS = 25;

/** Namespaced playlist id (decision E10) — guarantees no collision with the
 * ListenBrainz playlist UUIDs the serving route dedupes by id. */
function genreMixId(genre: string): string {
  return `inhouse:genre:${slug(genre)}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Title-case for display: "hip-hop" → "Hip-hop", "indie rock" → "Indie Rock". */
function displayGenre(genre: string): string {
  return genre
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Genre Mix: popularity-ranked tracks for the user's top recent genres, with
 * already-heard tracks down-weighted (sunk to the back, not removed — decision
 * E7) for a radio-station feel. */
export const genreMixGenerator: Generator = {
  id: "genre-mix",

  isApplicable(profile: TasteProfile): boolean {
    return profile.genreAffinity.some(
      (g) => g.effectiveRecentTracks >= GENRE_MIX_MIN_RECENT_TRACKS,
    );
  },

  async generate(
    profile: TasteProfile,
    ctx: GeneratorContext,
  ): Promise<PlaylistSpec[]> {
    // genreAffinity is sorted by weight desc, so filtering then slicing yields
    // the top qualifying genres by weight (the GATE is effectiveRecentTracks).
    const selected = profile.genreAffinity
      .filter((g) => g.effectiveRecentTracks >= GENRE_MIX_MIN_RECENT_TRACKS)
      .slice(0, GENRE_MIX_MAX_GENRES);

    const specs = await Promise.all(
      selected.map(async (g): Promise<PlaylistSpec | null> => {
        const candidates = await ctx.candidateService.popularTracksForTag(
          g.genre,
        );
        if (candidates.length === 0) {
          ctx.log.debug(
            { genre: g.genre },
            "genre-mix: no candidates for genre",
          );
          return null;
        }
        const ordered = downWeightHeard(candidates, ctx).slice(
          0,
          GENRE_MIX_TARGET_TRACKS,
        );
        return {
          id: genreMixId(g.genre),
          name: `${displayGenre(g.genre)} Mix`,
          description: `Popular ${g.genre} tracks picked for you.`,
          candidates: ordered,
        };
      }),
    );

    return specs.filter((s): s is PlaylistSpec => s !== null);
  },
};

/** Order popularity-ranked candidates with heard tracks sunk behind unheard,
 * preserving popularity order within each group. mbid-less candidates can't be
 * heard-matched, so they count as unheard. */
function downWeightHeard(
  candidates: Candidate[],
  ctx: GeneratorContext,
): Candidate[] {
  const unheard: Candidate[] = [];
  const heard: Candidate[] = [];
  for (const c of candidates) {
    if (c.mbid && ctx.heard.isHeard(c.mbid)) heard.push(c);
    else unheard.push(c);
  }
  return [...unheard, ...heard];
}
