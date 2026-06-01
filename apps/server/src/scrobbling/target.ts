import type { FastifyBaseLogger } from "fastify";
import type { UserSettingsRow } from "../db/queries/settings.js";

/**
 * Provider-agnostic data for a single listen submission. A target maps this
 * onto whatever shape its external API expects.
 */
export interface ListenSubmission {
  artistName: string;
  trackName: string;
  /** Unix epoch seconds, taken from the recorded listening_history row. */
  listenedAt: number;
  /** MusicBrainz recording MBID, may be null. */
  recordingMbid: string | null;
}

/**
 * A pluggable scrobble destination. The dispatch core never names any external
 * service — each target decides, from a UserSettingsRow, whether the user is
 * eligible (`isEligible` — i.e. has the credentials it needs), builds its own
 * typed `Ctx` (`buildContext`), and pushes a listen via `submit`.
 */
export interface ScrobbleTarget<Ctx = unknown> {
  readonly id: string;
  isEligible(settings: UserSettingsRow): boolean;
  buildContext(settings: UserSettingsRow): Ctx;
  submit(
    ctx: Ctx,
    listen: ListenSubmission,
    log: FastifyBaseLogger,
  ): Promise<void>;
}

type AnyScrobbleTarget = ScrobbleTarget<unknown>;

const registry = new Map<string, AnyScrobbleTarget>();

export function registerTarget(target: AnyScrobbleTarget): void {
  registry.set(target.id, target);
}

export function listRegisteredTargets(): AnyScrobbleTarget[] {
  return [...registry.values()];
}
