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
} as const;
export type ThemeRadius = typeof radius;
