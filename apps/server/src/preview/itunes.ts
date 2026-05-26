import { logger } from "../logger.js";

const log = logger.child({ module: "preview:itunes" });

const ITUNES_API = "https://itunes.apple.com";

export interface ItunesPreviewResult {
  itunesTrackId: string;
  previewUrl: string;
}

export async function lookupItunesPreview(
  artistName: string,
  trackTitle: string,
): Promise<ItunesPreviewResult | null> {
  try {
    const term = encodeURIComponent(`${artistName} ${trackTitle}`);
    const res = await fetch(
      `${ITUNES_API}/search?term=${term}&media=music&entity=song&limit=1`,
    );
    if (!res.ok) {
      log.warn(
        { status: res.status, artistName, trackTitle },
        "itunes preview non-ok response",
      );
      return null;
    }
    const data = (await res.json()) as {
      results?: Array<{ trackId: number; previewUrl?: string }>;
    };
    const track = data.results?.[0];
    if (!track?.previewUrl) return null;
    return {
      itunesTrackId: String(track.trackId),
      previewUrl: track.previewUrl,
    };
  } catch (err) {
    log.warn({ err, artistName, trackTitle }, "itunes preview lookup failed");
    return null;
  }
}
