import type { TasteProfile } from "../profile/types.js";
import { blendCandidates, type BlendSource } from "./blend.js";
import type { Generator, GeneratorContext, PlaylistSpec } from "./types.js";

// Tunable starting values (spec §5.2).
export const SOMETHING_NEW_ADJACENT_MAX = 4;
export const SOMETHING_NEW_PER_SOURCE_CAP = 8;
export const SOMETHING_NEW_TARGET_TRACKS = 25;

/** Something New: one discovery mix sourced from the profile's adjacency set —
 * popular tracks for adjacent tags plus top tracks for adjacent artists,
 * round-robin interleaved for variety. Adjacency is seeded from the top
 * affinities, so a thin profile produces no adjacency and the gate fails (no
 * empty playlist served). Discovery → heard tracks hard-excluded (spec §5.2). */
export const somethingNewGenerator: Generator = {
  id: "something-new",

  isApplicable(profile: TasteProfile): boolean {
    return (
      profile.adjacency.tags.length > 0 || profile.adjacency.artists.length > 0
    );
  },

  async generate(
    profile: TasteProfile,
    ctx: GeneratorContext,
  ): Promise<PlaylistSpec[]> {
    const tags = profile.adjacency.tags.slice(0, SOMETHING_NEW_ADJACENT_MAX);
    const artists = profile.adjacency.artists.slice(
      0,
      SOMETHING_NEW_ADJACENT_MAX,
    );

    const [tagSources, artistSources] = await Promise.all([
      Promise.all(
        tags.map(
          async (tag): Promise<BlendSource> => ({
            candidates: (
              await ctx.candidateService.popularTracksForTag(tag)
            ).slice(0, SOMETHING_NEW_PER_SOURCE_CAP),
          }),
        ),
      ),
      Promise.all(
        artists.map(
          async (artist): Promise<BlendSource> => ({
            candidates: (
              await ctx.candidateService.topTracksForArtist(artist)
            ).slice(0, SOMETHING_NEW_PER_SOURCE_CAP),
          }),
        ),
      ),
    ]);

    // No weights → round-robin interleave across every adjacency source.
    const blended = blendCandidates(
      [...tagSources, ...artistSources],
      ctx.heard,
      "exclude",
      SOMETHING_NEW_TARGET_TRACKS,
    );
    if (blended.length === 0) {
      ctx.log.debug(
        { tagCount: tags.length, artistCount: artists.length },
        "something-new: no candidates after blend",
      );
      return [];
    }

    return [
      {
        id: "inhouse:something-new",
        name: "Something New",
        description: "Fresh tracks just outside your usual rotation.",
        candidates: blended,
      },
    ];
  },
};
