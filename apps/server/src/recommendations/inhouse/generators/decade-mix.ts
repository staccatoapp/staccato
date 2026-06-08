import type { TasteProfile } from "../profile/types.js";
import { blendCandidates } from "./blend.js";
import type { Generator, GeneratorContext, PlaylistSpec } from "./types.js";

// Tunable starting values (spec §5.3).
export const DECADE_MIX_MIN_RECENT = 3;
export const DECADE_MIX_TARGET_TRACKS = 25;

/** Decade Mix: one radio-feel mix for the user's single dominant decade, sourced
 * from the Last.fm "<decade>s" tag (e.g. "2000s"). The decade tag is user-applied
 * and noisy — observe yield via resolution's `resolved X of Y` summary; the
 * deferred MB first-release-date axis is the upgrade path if it's consistently
 * thin (spec §5.3, decision F4). Heard tracks down-weighted, mirroring Genre
 * Mix (decision F6). */
export const decadeMixGenerator: Generator = {
  id: "decade-mix",

  isApplicable(profile: TasteProfile): boolean {
    // decadeAffinity is sorted by weight desc, so [0] is the dominant decade.
    const dominant = profile.decadeAffinity[0];
    return (
      dominant !== undefined &&
      dominant.effectiveRecentTracks >= DECADE_MIX_MIN_RECENT
    );
  },

  async generate(
    profile: TasteProfile,
    ctx: GeneratorContext,
  ): Promise<PlaylistSpec[]> {
    const dominant = profile.decadeAffinity[0];
    if (
      dominant === undefined ||
      dominant.effectiveRecentTracks < DECADE_MIX_MIN_RECENT
    ) {
      return [];
    }

    const tag = `${dominant.decade}s`;
    const candidates = await ctx.candidateService.popularTracksForTag(tag);
    if (candidates.length === 0) {
      ctx.log.debug({ tag }, "decade-mix: no candidates for decade tag");
      return [];
    }

    const blended = blendCandidates(
      [{ candidates }],
      ctx.heard,
      "downweight",
      DECADE_MIX_TARGET_TRACKS,
    );

    return [
      {
        id: `inhouse:decade:${dominant.decade}`,
        name: `${dominant.decade}s Mix`,
        description: `Popular ${tag} tracks picked for you.`,
        candidates: blended,
      },
    ];
  },
};
