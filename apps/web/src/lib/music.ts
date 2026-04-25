export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateAlbumGradient(title: string, artist: string): string {
  const titleAndArtist = title + artist;
  let hash = 0;
  for (let i = 0; i < titleAndArtist.length; i++) {
    hash = titleAndArtist.charCodeAt(i) + ((hash << 5) - hash);
  }
  const baseColor = Math.abs(hash) % 360;
  const offsetColor = (baseColor + 45) % 360;
  return `linear-gradient(135deg, oklch(0.32 0.12 ${baseColor}) 0%, oklch(0.2 0.07 ${offsetColor}) 100%)`;
}
