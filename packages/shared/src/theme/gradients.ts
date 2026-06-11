/**
 * Album-art placeholder gradients from the mobile home-screen design handoff.
 *
 * Like colors.ts, the oklch values are the source of truth and the rgb values
 * are precomputed (oklch -> sRGB, gamut-clamped) because React Native cannot
 * parse oklch(). Each gradient is rendered at 135deg from the first stop to
 * the second.
 */

const tokens = {
  sunset: {
    oklch: ["oklch(0.55 0.20 30)", "oklch(0.32 0.14 10)"],
    rgb: ["#cc2a1b", "#670022"],
  },
  dusk: {
    oklch: ["oklch(0.50 0.18 280)", "oklch(0.30 0.13 250)"],
    rgb: ["#544ec5", "#002c6b"],
  },
  sea: {
    oklch: ["oklch(0.55 0.16 150)", "oklch(0.32 0.11 195)"],
    rgb: ["#008a39", "#004244"],
  },
  amber: {
    oklch: ["oklch(0.58 0.18 70)", "oklch(0.40 0.13 40)"],
    rgb: ["#bb5f00", "#7e2500"],
  },
  berry: {
    oklch: ["oklch(0.50 0.18 320)", "oklch(0.30 0.13 290)"],
    rgb: ["#8e35a1", "#311969"],
  },
  ocean: {
    oklch: ["oklch(0.50 0.15 200)", "oklch(0.30 0.10 240)"],
    rgb: ["#007a85", "#00315a"],
  },
  moss: {
    oklch: ["oklch(0.45 0.14 100)", "oklch(0.30 0.10 130)"],
    rgb: ["#685400", "#1c3600"],
  },
  rose: {
    oklch: ["oklch(0.55 0.18 10)", "oklch(0.32 0.13 350)"],
    rgb: ["#c23359", "#5e033c"],
  },
} as const;

export type GradientKey = keyof typeof tokens;

/** Full token map including oklch source values (for CSS codegen). */
export const GradientTokens = tokens;

/** Flat key -> [fromRgb, toRgb] map for direct use in React Native styles. */
export const Gradients = Object.fromEntries(
  Object.entries(tokens).map(([name, value]) => [name, value.rgb]),
) as { [K in GradientKey]: (typeof tokens)[K]["rgb"] };
