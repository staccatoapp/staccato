import type { FastifyBaseLogger } from "fastify";

export interface RecommendationSourceContext {
  listenbrainzToken: string;
  musicbrainzUsername: string;
}

export interface RecommendationSource<
  Kind extends string,
  Payload extends unknown[],
> {
  readonly id: string;
  readonly kind: Kind;
  readonly refreshIntervalMs: number;
  readonly emptyRetryIntervalMs?: number;
  fetch(
    ctx: RecommendationSourceContext,
    log: FastifyBaseLogger,
  ): Promise<Payload>;
}

type AnyRecommendationSource = RecommendationSource<string, unknown[]>;

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
