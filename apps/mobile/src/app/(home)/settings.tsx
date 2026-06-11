import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/ui/primary-button";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

/** Placeholder until the Settings screen is designed. */
export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const { signOut } = useSession();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.fg }]}>Settings</Text>
      <View
        style={{
          alignSelf: "stretch",
          marginTop: 24,
          paddingHorizontal: spacing.screen,
        }}
      >
        <PrimaryButton onPress={() => void signOut()}>Sign out</PrimaryButton>
      </View>
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
