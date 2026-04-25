import throttle from "p-throttle";

const ACOUSTID_BASE = "https://api.acoustid.org/v2";

export interface AcoustIdMatch {
  recordingMbid: string;
  acoustidScore: number;
}

// acoustID rate limit: 3 requests per sec. pls don't change
const throttledFetch = throttle({ limit: 3, interval: 1000 })((url: string) =>
  fetch(url),
);

export async function lookupFingerprint(
  duration: number,
  fingerprint: string,
  apiKey: string,
): Promise<AcoustIdMatch | null> {
  try {
    const params = new URLSearchParams({
      client: apiKey,
      duration: String(Math.round(duration)),
      fingerprint,
      meta: "recordings",
    });
    const res = await throttledFetch(`${ACOUSTID_BASE}/lookup?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        score: number;
        recordings?: Array<{ id: string }>;
      }>;
    };

    if (data.status !== "ok" || !data.results?.length) return null;

    const best = data.results[0];
    const topRecording = best?.recordings?.[0];
    if (!best || best.score < 0.8 || !topRecording) return null;

    return {
      recordingMbid: topRecording.id,
      acoustidScore: best.score,
    };
  } catch {
    return null;
  }
}
