/**
 * Inter variable font, loaded in the root layout via expo-font under the
 * family name "Inter"; weight is selected with the fontWeight style prop.
 *
 * Known limitation: the handoff wordmark uses OpenType features ss01 + cv11,
 * which React Native cannot enable — the wordmark renders with default
 * Inter letterforms (subtle difference, accepted).
 */
export const typography = {
  fontFamily: "Inter",
} as const;
export type ThemeTypography = typeof typography;
