// Pure ranking primitives for the unified user search (R3). Shared so the
// façade (which does the ranking) and any future consumer use one definition.
// These are deliberately small and side-effect free — the weight-blending that
// combines them lives in the façade (apps/metadata-service/src/search/rank.ts).

// Lowercase, strip diacritics, collapse non-alphanumerics to single spaces, and
// split into tokens. Empty/whitespace input yields an empty array.
export function normalizeText(input: string | null | undefined): string[] {
  if (!input) return [];
  // NFKD decomposes accented characters into base + combining mark; the
  // alphanumeric filter below then drops the marks, so accents are normalized
  // away ("Beyoncé" → "beyonce") without a dedicated diacritics regex.
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// Fraction of the query's distinct tokens present in the entity's identity
// string (artist → name; track/album → "title artist"). 1.0 means the identity
// accounts for every query token — the signal that routes "Frank Ocean" to the
// artist but "Frank Ocean Lost" to the track. Returns 0 for an empty query.
export function tokenCoverage(
  query: string,
  identity: string | null | undefined,
): number {
  const q = new Set(normalizeText(query));
  if (q.size === 0) return 0;
  const id = new Set(normalizeText(identity));
  let hit = 0;
  for (const t of q) if (id.has(t)) hit++;
  return hit / q.size;
}

// Normalize a ListenBrainz listen count to 0–1 on a log scale. ~10M listens
// (the most popular artists) maps to ≈1; LOG_MAX is the log10 of that ceiling.
export const POPULARITY_LOG_MAX = 7;

export function popularityScore(
  listenCount: number | null | undefined,
): number {
  if (!listenCount || listenCount <= 0) return 0;
  return Math.min(1, Math.log10(listenCount + 1) / POPULARITY_LOG_MAX);
}
