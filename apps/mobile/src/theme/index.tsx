import React, {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

import { colors, type ThemeColors } from "./colors";
import { radius, type ThemeRadius } from "./radius";
import { spacing, type ThemeSpacing } from "./spacing";
import { typography, type ThemeTypography } from "./typography";

export interface StaccatoTheme {
  colors: ThemeColors;
  radius: ThemeRadius;
  spacing: ThemeSpacing;
  typography: ThemeTypography;
}

const theme: StaccatoTheme = { colors, radius, spacing, typography };

const ThemeContext = createContext<StaccatoTheme | null>(null);

export function StaccatoThemeProvider({ children }: PropsWithChildren) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): StaccatoTheme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within a StaccatoThemeProvider");
  }
  return value;
}
