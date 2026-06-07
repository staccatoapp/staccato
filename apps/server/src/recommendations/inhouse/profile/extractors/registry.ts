import type { SignalExtractor } from "../types.js";

const registry = new Map<string, SignalExtractor>();

export function registerExtractor(extractor: SignalExtractor): void {
  registry.set(extractor.id, extractor);
}

export function listRegisteredExtractors(): SignalExtractor[] {
  return [...registry.values()];
}
