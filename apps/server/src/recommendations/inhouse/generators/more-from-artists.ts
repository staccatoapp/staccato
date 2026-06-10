import type { TasteProfile } from "../profile/types.js";
import { blendCandidates, type BlendSource } from "./blend.js";
import type { Generator, GeneratorContext, PlaylistSpec } from "./types.js";

// Tunable starting values — tune against real yield/relevance data (spec §5.1).
export const ARTISTS_MIN_RECENT = 3;
export const ARTISTS_MAX = 5;
export const ARTISTS_PER_SOURCE_CAP = 10;
export const ARTISTS_TARGET_TRACKS = 25;

/** More From Artists You Love: a single combined mix of unheard popular tracks
 * from the user's most-loved recent artists, weight-proportionally interleaved so
 * a more-loved artist contributes more without monopolising the head. Discovery
 * surface → heard tracks are hard-excluded (spec §5.1, decision F6). */
export const moreFromArtistsGenerator: Generator = {
  id: "more-from-artists",

  isApplicable(profile: TasteProfile): boolean {
    return profile.artistAffinity.some(
      (a) => a.effectiveRecentTracks >= ARTISTS_MIN_RECENT,
    );
  },

  async generate(
    profile: TasteProfile,
    ctx: GeneratorContext,
  ): Promise<PlaylistSpec[]> {
    // artistAffinity is sorted by weight desc; filter then slice → top qualifying
    // artists by weight (the GATE is effectiveRecentTracks).
    const selected = profile.artistAffinity
      .filter((a) => a.effectiveRecentTracks >= ARTISTS_MIN_RECENT)
      .slice(0, ARTISTS_MAX);

    const sources: BlendSource[] = await Promise.all(
      selected.map(async (a): Promise<BlendSource> => {
        const candidates = (
          await ctx.candidateService.topTracksForArtist(
            a.artistName,
            a.artistMbid,
          )
        ).slice(0, ARTISTS_PER_SOURCE_CAP);
        return { candidates, weight: a.weight };
      }),
    );

    const blended = blendCandidates(
      sources,
      ctx.heard,
      "exclude",
      ARTISTS_TARGET_TRACKS,
    );
    if (blended.length === 0) {
      ctx.log.debug(
        { artistCount: selected.length },
        "more-from-artists: no candidates after blend",
      );
      return [];
    }

    return [
      {
        id: "inhouse:artists",
        name: "Artists You Love",
        description: "More from the artists you've been playing.",
        candidates: blended,
      },
    ];
  },
};
