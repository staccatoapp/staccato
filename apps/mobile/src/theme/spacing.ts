/** Layout metrics from the design handoff. */
export const spacing = {
  /** Horizontal screen padding for content */
  screen: 24,
  /** Inset for cards / list groups */
  card: 16,
  /** Height of inputs and primary buttons */
  controlHeight: 50,
  /** Minimum tap target (e.g. show/hide-password toggle) */
  minHitTarget: 44,
} as const;
export type ThemeSpacing = typeof spacing;
