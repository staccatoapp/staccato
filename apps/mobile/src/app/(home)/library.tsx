import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme";

/** Placeholder until the Library screen is designed. */
export default function LibraryScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.fg }]}>Library</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
});
