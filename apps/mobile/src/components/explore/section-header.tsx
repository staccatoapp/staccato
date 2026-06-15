import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

/** Explore section header: bold title with an optional muted subtitle. */
export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.root}>
      <Text
        style={[
          styles.title,
          { color: colors.fg, fontFamily: typography.fontFamily },
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            { color: colors.fgMuted, fontFamily: typography.fontFamily },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
