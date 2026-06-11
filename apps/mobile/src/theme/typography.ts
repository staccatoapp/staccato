/**
 * Platform system font: leaving fontFamily undefined renders SF Pro on iOS
 * and Roboto on Android, per the home-screen design handoff. Weight is
 * selected with the fontWeight style prop.
 */
export const typography = {
  fontFamily: undefined as string | undefined,
} as const;
export type ThemeTypography = typeof typography;
