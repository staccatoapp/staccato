/**
 * Up to 4 unique track cover arts, in track order, for a 2x2 mosaic thumbnail.
 *
 * Recommended playlists expose only a single `coverArtUrl`, so a mosaic (matching
 * how in-library playlists render) is derived from their embedded tracklist.
 * `AlbumArt` renders a 2x2 mosaic only when given exactly 4 arts; fewer fall back
 * to a single tile, so capping at 4 yields a mosaic whenever >= 4 unique exist.
 */
export function mosaicArtFromTracks(
  tracks: { coverArtUrl: string | null }[],
): string[] {
  const unique: string[] = [];
  for (const t of tracks) {
    if (t.coverArtUrl && !unique.includes(t.coverArtUrl)) {
      unique.push(t.coverArtUrl);
    }
    if (unique.length === 4) break;
  }
  return unique;
}
