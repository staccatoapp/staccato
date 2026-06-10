import React, { type PropsWithChildren } from "react";
import { View } from "react-native";

import { useTheme } from "@/theme";

/** Raised, rounded container for grouped list rows (e.g. recent servers). */
export function ListGroup({ children }: PropsWithChildren) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bgRaised,
        borderRadius: radius.card,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
