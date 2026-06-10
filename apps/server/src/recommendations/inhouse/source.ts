import { z } from "zod";
import {
  RecommendedPlaylistSchema,
  type RecommendedPlaylist,
} from "@staccato/shared";
import { serverConfig } from "../../config/server-config.js";
import type { RecommendationSource } from "../source.js";
import { candidateService } from "./candidates/service.js";
import { listRegisteredGenerators } from "./generators/registry.js";
import type { PlaylistSpec } from "./generators/types.js";
import { resolvePlaylists } from "./resolution/resolve.js";
import { buildTasteProfile } from "./profile/build-profile.js";
// Side-effect: registers all in-house generators into the generator registry
// (mirrors how sources/index.ts self-registers sources).
import "./generators/index.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface InhouseSourceContext {
  userId: string;
}

/**
 * The in-house, Last.fm-backed recommendation source. It is "just another
 * playlists-kind source" to the pipeline: boot/route seeding, the refresher and
 * the serving route need no in-house-specific code (recs spec §9).
 */
export const inhouseSource: RecommendationSource<
  "playlists",
  RecommendedPlaylist[],
  InhouseSourceContext
> = {
  id: "inhouse",
  kind: "playlists",
  refreshIntervalMs: ONE_DAY_MS,
  // Cold-start users (no applicable generator yet) retry sooner than the full
  // 24h cadence so a first mix appears once they have enough recent listening.
  emptyRetryIntervalMs: ONE_HOUR_MS,

  // The Last.fm api_key is server-global (decision E2): recommendations are
  // public reads and never need a per-user credential, so eligibility reads
  // serverConfig, NOT the user row. buildContext still uses the row's userId for
  // identity — whose listening_history to profile.
  isEligible: () => Boolean(serverConfig.get().lastfm.apiKey),
  buildContext: (s) => ({ userId: s.userId }),

  async fetch(ctx, log) {
    const profile = await buildTasteProfile(ctx.userId, {
      log,
      now: Date.now(),
    });

    const specs: PlaylistSpec[] = [];
    for (const generator of listRegisteredGenerators()) {
      if (!generator.isApplicable(profile)) continue;
      try {
        const generated = await generator.generate(profile, {
          candidateService,
          heard: profile.heard,
          log,
        });
        specs.push(...generated);
      } catch (err) {
        log.warn(
          { err, generatorId: generator.id, userId: ctx.userId },
          "in-house generator failed; skipping its playlists",
        );
      }
    }

    const playlists = await resolvePlaylists(specs, log);
    return z.array(RecommendedPlaylistSchema).parse(playlists);
  },
};
