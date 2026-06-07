import type { Generator } from "./types.js";

// Mirrors the source/extractor registries: a module-level map populated by
// import side-effect (see index.ts). Keyed by generator id.
const registry = new Map<string, Generator>();

export function registerGenerator(generator: Generator): void {
  registry.set(generator.id, generator);
}

export function listRegisteredGenerators(): Generator[] {
  return [...registry.values()];
}
