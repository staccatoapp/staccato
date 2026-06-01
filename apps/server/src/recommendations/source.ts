import type { FastifyBaseLogger } from "fastify";
import type { UserSettingsRow } from "../db/queries/settings.js";

// The context shape consumed by the ListenBrainz sources. Other providers
// define their own context type and tie it to their `fetch` via the `Ctx`
// type parameter on RecommendationSource.
export interface RecommendationSourceContext {
  listenbrainzToken: string;
  musicbrainzUsername: string;
}

export interface RecommendationSource<
  Kind extends string,
  Payload extends unknown[],
  Ctx = unknown,
> {
  readonly id: string;
  readonly kind: Kind;
  readonly refreshIntervalMs: number;
  readonly emptyRetryIntervalMs?: number;
  /**
   * Whether this user can use this source — i.e. has the credentials it needs.
   * Gates boot/route seeding and is re-checked on every refresh.
   */
  isEligible(settings: UserSettingsRow): boolean;
  /** Build the typed context this source's `fetch` needs from user settings. */
  buildContext(settings: UserSettingsRow): Ctx;
  fetch(ctx: Ctx, log: FastifyBaseLogger): Promise<Payload>;
}

type AnyRecommendationSource = RecommendationSource<string, unknown[], unknown>;

const registry = new Map<string, AnyRecommendationSource>();

function registryKey(sourceId: string, kind: string): string {
  return `${sourceId}/${kind}`;
}

export function registerSource(source: AnyRecommendationSource): void {
  registry.set(registryKey(source.id, source.kind), source);
}

export function getSource(
  sourceId: string,
  kind: string,
): AnyRecommendationSource | undefined {
  return registry.get(registryKey(sourceId, kind));
}

export function listRegisteredSources(): AnyRecommendationSource[] {
  return [...registry.values()];
}
