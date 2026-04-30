import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class RecommendationCache<T> {
  private map = new Map<string, CacheEntry<T>>();

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
      : Date.now() + TWO_WEEKS_MS;
    this.map.set(key, { data, expiresAt: expiry });
  }
}

export const playlistCache = new RecommendationCache<RecommendedPlaylist[]>();
export const trackCache = new RecommendationCache<RecommendedTrack[]>();
