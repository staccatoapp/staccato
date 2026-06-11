/** Radius scale from the design handoff. */
export const radius = {
  /** Inputs and primary buttons */
  input: 12,
  /** Cards, list groups, server chip */
  card: 13,
  /** Error banner */
  banner: 10,
  /** Small icon tiles (recent-server rows) */
  iconTile: 7,
  /** Home hero recommendation card */
  heroCard: 16,
  /** Carousel card album art */
  carouselArt: 10,
  /** Quick-start grid cell */
  quickStartCell: 10,
  /** Quick-start grid album art */
  quickStartArt: 6,
} as const;
export type ThemeRadius = typeof radius;
