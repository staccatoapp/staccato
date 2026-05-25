import PQueue from "p-queue";
import { logger } from "../../logger.js";
import { config } from "../../config.js";

const log = logger.child({ module: "library:acoustid" });

const ACOUSTID_BASE = "https://api.acoustid.org/v2";

export interface AcoustIdArtist {
  mbid: string;
  name: string;
  joinPhrase: string | null;
}

export interface AcoustIdCandidate {
  recordingMbid: string;
  score: number;
  title: string | null;
  durationSec: number | null;
  artists: AcoustIdArtist[];
}

// AcoustID rate limit: 3 requests per second per client key.
const acoustidQueue = new PQueue({
  concurrency: 3,
  intervalCap: 3,
  interval: 1000,
  carryoverConcurrencyCount: true,
});

async function throttledFetch(url: string): Promise<Response> {
  const res = await acoustidQueue.add(() => {
    log.debug({ url }, "fetching acoustid");
    return fetch(url);
  });
  if (!res) throw new Error("acoustid queue returned no response");
  return res;
}

interface AcoustIdResponse {
  status: string;
  results?: Array<{
    score: number;
    recordings?: Array<{
      id: string;
      title?: string;
      duration?: number;
      artists?: Array<{ id: string; name: string; joinphrase?: string }>;
    }>;
  }>;
}

// Request recording-level metadata inline (title, duration, artists) so the
// resolver can score AcoustID candidates without a per-candidate MusicBrainz
// round-trip. The winning candidate is enriched with the full release graph
// later (one MB call), since AcoustID does not return release-level detail.
// `meta` must be a single token here: URLSearchParams encodes a literal "+"
// as %2B, so "recordings+compress" reaches AcoustID as one unknown token and
// it returns score-only results with empty recordings arrays.
export async function lookupFingerprint(
  duration: number,
  fingerprint: string,
  apiKey: string,
): Promise<AcoustIdCandidate[]> {
  try {
    const params = new URLSearchParams({
      client: apiKey,
      duration: String(Math.round(duration)),
      fingerprint,
      meta: "recordings",
    });
    const res = await throttledFetch(`${ACOUSTID_BASE}/lookup?${params}`);
    if (!res.ok) {
      log.warn(
        { status: res.status, durationSec: Math.round(duration) },
        "acoustid lookup non-ok response",
      );
      return [];
    }

    const data = (await res.json()) as AcoustIdResponse;
    if (data.status !== "ok" || !data.results?.length) return [];

    // A recording id can appear under multiple results; keep the highest score.
    const byMbid = new Map<string, AcoustIdCandidate>();
    for (const result of data.results) {
      if (result.score < 0.5) continue;
      for (const recording of result.recordings ?? []) {
        const existing = byMbid.get(recording.id);
        if (existing && existing.score >= result.score) continue;
        byMbid.set(recording.id, {
          recordingMbid: recording.id,
          score: result.score,
          title: recording.title ?? null,
          durationSec: recording.duration ?? null,
          artists: (recording.artists ?? []).map((a) => ({
            mbid: a.id,
            name: a.name,
            joinPhrase: a.joinphrase ?? null,
          })),
        });
      }
    }
    return [...byMbid.values()];
  } catch (err) {
    log.warn(
      { err, durationSec: Math.round(duration) },
      "acoustid lookup failed",
    );
    return [];
  }
}

export function isAcoustidConfigured(): boolean {
  return Boolean(config.STACCATO_SERVER_ACOUSTID_API_KEY);
}

export function acoustidApiKey(): string | null {
  return config.STACCATO_SERVER_ACOUSTID_API_KEY || null;
}
