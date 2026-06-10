import { Colors } from "@staccato/shared";

/**
 * Canonical colour tokens come from @staccato/shared (oklch source values
 * precomputed to sRGB there, since React Native cannot parse oklch()).
 */
export const colors = Colors;
export type ThemeColors = typeof colors;
