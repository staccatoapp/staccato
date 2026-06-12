import { Search } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/theme";

/** Centered "no results" state for a non-matching library search. */
export function EmptyState({ query }: { query: string }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 48,
        paddingHorizontal: 32,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgRaised,
          marginBottom: 12,
        }}
      >
        <Search size={22} color={colors.fgSubtle} />
      </View>
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 15,
          fontWeight: "600",
          letterSpacing: -0.2,
          color: colors.fg,
          textAlign: "center",
        }}
      >
        {`No results for "${query}"`}
      </Text>
    </View>
  );
}
