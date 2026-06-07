import { listRegisteredExtractors } from "./extractors/registry.js";
import { buildHeardIndex } from "./heard.js";
import type { PartialProfile, ProfileContext, TasteProfile } from "./types.js";
// Side-effect: registers the signal extractors into the registry consumed below
// (mirrors how eligibility.ts imports sources/index.js next to
// listRegisteredSources). Without this the registry is empty in production and
// every profile comes back blank.
import "./extractors/index.js";

/** Run every eligible signal extractor and merge into a TasteProfile.
 * v1 has a single extractor; the merge below is the seam future extractors
 * (demographics, …) plug into. Later slices override earlier ones when both
 * set the same field — there is no cross-extractor blending in v1. */
export async function buildTasteProfile(
  userId: string,
  ctx: ProfileContext,
): Promise<TasteProfile> {
  const extractors = listRegisteredExtractors().filter(
    (e) => e.isEligible?.(userId) ?? true,
  );

  const partials: PartialProfile[] = [];
  for (const extractor of extractors) {
    try {
      partials.push(await extractor.extract(userId, ctx));
    } catch (err) {
      ctx.log.warn(
        { err, extractorId: extractor.id, userId },
        "signal extractor failed; skipping its contribution",
      );
    }
  }

  const merged = partials.reduce<PartialProfile>(
    (acc, p) => ({ ...acc, ...p }),
    {},
  );

  return {
    userId,
    genreAffinity: merged.genreAffinity ?? [],
    artistAffinity: merged.artistAffinity ?? [],
    albumAffinity: merged.albumAffinity ?? [],
    decadeAffinity: merged.decadeAffinity ?? [],
    adjacency: merged.adjacency ?? { tags: [], artists: [] },
    heard: merged.heard ?? buildHeardIndex([]),
    computedAt: ctx.now,
  };
}
