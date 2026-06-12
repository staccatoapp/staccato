import { type GradientKey } from "@staccato/shared";

/**
 * Stable gradient palette used to colour artwork placeholders. A given id always
 * maps to the same gradient so a card's colour is consistent across renders.
 */
export const GRADIENT_KEYS: GradientKey[] = [
  "sunset",
  "dusk",
  "sea",
  "amber",
  "berry",
  "ocean",
  "rose",
];

/** Deterministically pick a placeholder gradient for an entity id. */
export function pickGradient(id: string): GradientKey {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENT_KEYS[hash % GRADIENT_KEYS.length]!;
}
