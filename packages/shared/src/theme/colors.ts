/**
 * Canonical Staccato colour tokens, shared by all UI apps.
 *
 * Source of truth is the oklch value on each token (from the mobile login-flow
 * design handoff, which supersedes the slightly-drifted values previously
 * hardcoded in apps/web). The rgb values are precomputed with culori
 * (oklch -> sRGB, gamut-clamped) because React Native cannot parse oklch().
 *
 * apps/web still defines its own CSS variables; migrating it to consume these
 * tokens via codegen is tracked as a follow-up issue.
 */

const tokens = {
  // Dark OLED surfaces
  bg: { oklch: "oklch(0.16 0 0)", rgb: "#0d0d0d" },
  bgRaised: { oklch: "oklch(0.21 0 0)", rgb: "#181818" },
  bgMuted: { oklch: "oklch(0.27 0 0)", rgb: "#262626" },
  bgSubtle: { oklch: "oklch(0.32 0 0)", rgb: "#333333" },

  // Text
  fg: { oklch: "oklch(0.985 0 0)", rgb: "#fafafa" },
  fgMuted: { oklch: "oklch(0.708 0 0)", rgb: "#a1a1a1" },
  fgSubtle: { oklch: "oklch(0.5 0 0)", rgb: "#636363" },

  // Hairlines and input borders
  border: { oklch: "oklch(1 0 0 / 8%)", rgb: "rgba(255, 255, 255, 0.08)" },
  borderStrong: {
    oklch: "oklch(1 0 0 / 14%)",
    rgb: "rgba(255, 255, 255, 0.14)",
  },
  inputBorder: {
    oklch: "oklch(1 0 0 / 12%)",
    rgb: "rgba(255, 255, 255, 0.12)",
  },

  // Brand (warm orange)
  primary: { oklch: "oklch(0.72 0.18 45)", rgb: "#fd7933" },
  primaryDim: { oklch: "oklch(0.62 0.16 45)", rgb: "#d16022" },
  primaryBg: {
    oklch: "oklch(0.72 0.18 45 / 18%)",
    rgb: "rgba(253, 121, 51, 0.18)",
  },
  primaryText: { oklch: "oklch(0.78 0.16 50)", rgb: "#ff9550" },
  focusBorder: {
    oklch: "oklch(0.70 0.18 45 / 60%)",
    rgb: "rgba(246, 114, 43, 0.6)",
  },
  focusRing: {
    oklch: "oklch(0.70 0.18 45 / 16%)",
    rgb: "rgba(246, 114, 43, 0.16)",
  },

  // States
  destructive: { oklch: "oklch(0.704 0.191 22.216)", rgb: "#ff6467" },
  errorBannerBg: {
    oklch: "oklch(0.704 0.191 22.216 / 12%)",
    rgb: "rgba(255, 100, 103, 0.12)",
  },
  success: { oklch: "oklch(0.72 0.17 145)", rgb: "#54bf5c" },
  successText: { oklch: "oklch(0.78 0.14 150)", rgb: "#6fd087" },
  successButton: { oklch: "oklch(0.55 0.14 150)", rgb: "#1c8742" },

  // Accents
  serverBlue: { oklch: "oklch(0.60 0.16 250)", rgb: "#1a83db" },
} as const;

export type ColorToken = keyof typeof tokens;

/** Full token map including oklch source values (for CSS codegen). */
export const ColorTokens = tokens;

/** Flat token -> sRGB map for direct use in React Native styles. */
export const Colors = Object.fromEntries(
  Object.entries(tokens).map(([name, value]) => [name, value.rgb]),
) as { [K in ColorToken]: (typeof tokens)[K]["rgb"] };
