/**
 * Ranks keys by how often they appear, most frequent first. Ties are broken by
 * first appearance (stable), so callers can pass an already-meaningfully-ordered
 * list (e.g. tracks by position) and get a deterministic result. Null/undefined
 * and empty-string keys are dropped.
 *
 * Used to pick the dominant cover arts for a playlist mosaic: pass each track's
 * album id (server) or cover-art url (client) and take the top few.
 */
export function topFrequentKeys(
  keys: (string | null | undefined)[],
  limit = Infinity,
): string[] {
  const counts = new Map<string, number>();
  // First-seen order is captured implicitly: Map preserves insertion order, so
  // a stable sort over its entries keeps ties in first-appearance order.
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
}
