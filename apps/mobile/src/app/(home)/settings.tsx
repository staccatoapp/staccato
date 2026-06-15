import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/ui/primary-button";
import { useContentBottomInset } from "@/lib/player-layout";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme";

/** Placeholder until the Settings screen is designed. */
export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const { signOut } = useSession();

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
    >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
});
