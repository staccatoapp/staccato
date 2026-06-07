// Tunable: a listen this many days old counts half as much as one today.
export const RECENCY_HALF_LIFE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Exponential recency decay in (0,1]. 1.0 "now", 0.5 at one half-life.
 * All timestamps are unix epoch **ms**. */
export function recencyDecay(
  lastListenedAtMs: number,
  now: number,
  halfLifeDays = RECENCY_HALF_LIFE_DAYS,
): number {
  const ageDays = Math.max(0, (now - lastListenedAtMs) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Per-track contribution weight: play count attenuated by recency. */
export function trackWeight(
  playCount: number,
  lastListenedAtMs: number,
  now: number,
): number {
  return playCount * recencyDecay(lastListenedAtMs, now);
}
