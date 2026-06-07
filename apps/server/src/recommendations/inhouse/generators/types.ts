import type { FastifyBaseLogger } from "fastify";
import type { HeardIndex } from "../profile/heard.js";
import type { TasteProfile } from "../profile/types.js";
import type { Candidate, CandidateService } from "../candidates/service.js";

/** An unresolved themed playlist a generator emits: ordered candidate specs the
 * shared resolution pass turns into a RecommendedPlaylist (resolution preserves
 * order minus drops). Generators own taste→candidates+ordering and stay free of
 * MusicBrainz/cover-art deps (recs spec §7.3, Approach A / decision E9). */
export interface PlaylistSpec {
  id: string;
  name: string;
  description: string | null;
  candidates: Candidate[];
}

/** Shared tools handed to every generator. */
export interface GeneratorContext {
  candidateService: CandidateService;
  heard: HeardIndex;
  log: FastifyBaseLogger;
}

export interface Generator {
  readonly id: string;
  /** Cheap, profile-only gate — skip the generator entirely when false. */
  isApplicable(profile: TasteProfile): boolean;
  generate(
    profile: TasteProfile,
    ctx: GeneratorContext,
  ): Promise<PlaylistSpec[]>;
}

export type { Candidate };
