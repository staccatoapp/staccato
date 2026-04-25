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
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ trackId: number; previewUrl?: string }>;
    };
    const track = data.results?.[0];
    if (!track?.previewUrl) return null;
    return {
      itunesTrackId: String(track.trackId),
      previewUrl: track.previewUrl,
    };
  } catch {
    return null;
  }
}
