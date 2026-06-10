import React, { type PropsWithChildren } from "react";
import { Text } from "react-native";

import { useTheme } from "@/theme";

/** Uppercase field-label recipe: 13px / 600 / +0.4 tracking, muted. */
export function FieldLabel({ children }: PropsWithChildren) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={{
        fontFamily: typography.fontFamily,
        fontSize: 13,
        fontWeight: "600",
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: colors.fgMuted,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
