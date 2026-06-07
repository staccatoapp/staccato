// A small, provider-agnostic cooperative backoff gate for an external API that
// has no published rate limit (or a fuzzy one). When the API pushes back, the
// consumer records it; the gate tells every subsequent caller how long to wait,
// growing the cooldown exponentially per consecutive hit and resetting on a
// clean response. Each consumer creates its own instance — state is per-gate,
// not global, so it composes and tests without shared mutable module state.

export interface RateLimitGateOptions {
  /** Backoff applied to the first hit when the API gives no Retry-After hint. */
  baseBackoffMs?: number;
  /** Upper bound the exponential growth is capped at. */
  maxBackoffMs?: number;
  /** Growth multiplier per consecutive hit (default doubles). */
  factor?: number;
}

export interface RateLimitGate {
  /** How long the next request must wait (0 when not currently limited). */
  waitMs(now?: number): number;
  /**
   * Record a rate-limit response. Honours an explicit `retryAfterMs` when the
   * API provides one; otherwise grows the cooldown exponentially per
   * consecutive hit, capped at `maxBackoffMs`. Returns the applied backoff.
   */
  noteLimited(opts?: { retryAfterMs?: number | null }, now?: number): number;
  /** Record a successful request; resets the exponential streak. */
  noteSuccess(): void;
}

const DEFAULT_BASE_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_FACTOR = 2;

export function createRateLimitGate(
  options: RateLimitGateOptions = {},
): RateLimitGate {
  const base = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const max = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const factor = options.factor ?? DEFAULT_FACTOR;

  let pausedUntil = 0;
  let consecutiveHits = 0;

  return {
    waitMs(now: number = Date.now()): number {
      return Math.max(0, pausedUntil - now);
    },

    noteLimited(
      { retryAfterMs }: { retryAfterMs?: number | null } = {},
      now: number = Date.now(),
    ): number {
      const exponential = Math.min(max, base * factor ** consecutiveHits);
      consecutiveHits += 1;
      const backoff =
        retryAfterMs != null && retryAfterMs > 0 ? retryAfterMs : exponential;
      pausedUntil = Math.max(pausedUntil, now + backoff);
      return backoff;
    },

    noteSuccess(): void {
      consecutiveHits = 0;
    },
  };
}

/** Parse an HTTP `Retry-After` header (delta-seconds or HTTP-date) to ms; null if absent/unparseable. */
export function parseRetryAfterMs(
  headerValue: string | null,
  now: number = Date.now(),
): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const epoch = Date.parse(headerValue);
  if (!Number.isNaN(epoch)) return Math.max(0, epoch - now);
  return null;
}
