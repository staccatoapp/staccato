import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class RecommendationCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private defaultTtlMs: number = TWO_WEEKS_MS) {}

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T, expiresAt: string | null): void {
    const expiry = expiresAt
      ? new Date(expiresAt).getTime()
      : Date.now() + this.defaultTtlMs;
    this.map.set(key, { data, expiresAt: expiry });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  async getOrCompute(
    key: string,
    factory: () => Promise<{ data: T; expiresAt: string | null }>,
  ): Promise<T> {
    const cached = this.get(key);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      const { data, expiresAt } = await factory();
      this.set(key, data, expiresAt);
      return data;
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }
}

export const playlistCache = new RecommendationCache<RecommendedPlaylist[]>();
export const trackCache = new RecommendationCache<RecommendedTrack[]>(
  ONE_DAY_MS,
);
