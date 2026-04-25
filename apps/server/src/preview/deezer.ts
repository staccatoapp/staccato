const DEEZER_API = "https://api.deezer.com";

export interface DeezerPreviewResult {
  deezerTrackId: string;
  previewUrl: string;
}

export async function lookupDeezerPreview(
  artistName: string,
  trackTitle: string,
): Promise<DeezerPreviewResult | null> {
  try {
    const q = encodeURIComponent(`${artistName} ${trackTitle}`);
    const res = await fetch(`${DEEZER_API}/search/track?q=${q}&limit=1`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ id: number; preview: string }>;
    };
    const track = data.data?.[0];
    if (!track?.preview) return null;
    return { deezerTrackId: String(track.id), previewUrl: track.preview };
  } catch {
    return null;
  }
}
