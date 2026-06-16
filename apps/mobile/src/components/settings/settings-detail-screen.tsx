import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/ui/screen";
import { useContentBottomInset } from "@/lib/player-layout";
import { useTheme } from "@/theme";

interface SettingsDetailScreenProps {
  title: string;
  /** Label next to the back chevron (the parent screen's title). */
  backLabel?: string;
  children: ReactNode;
}

/**
 * Shared chrome for pushed Settings detail screens: a custom top nav bar (back
 * chevron + back label + centered title) honoring the top safe-area inset, over
 * a scroll view that clears the mini player + tab bar. Native Stack header stays
 * hidden (per mobile-navigation rule) so the `Screen` entrance owns the motion.
 */
export function SettingsDetailScreen({
  title,
  backLabel = "Settings",
  children,
}: SettingsDetailScreenProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: false });

  return (
    <Screen>
      <View
        style={{
          paddingTop: insets.top,
          height: insets.top + 44,
          justifyContent: "center",
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={() => router.back()}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            paddingHorizontal: 8,
            height: 44,
            alignSelf: "flex-start",
          }}
        >
          <ChevronLeft size={26} color={colors.primaryText} strokeWidth={2.2} />
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 16.5,
              letterSpacing: -0.3,
              color: colors.primaryText,
              maxWidth: 120,
            }}
          >
            {backLabel}
          </Text>
        </Pressable>
        <Text
          numberOfLines={1}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            bottom: 12,
            textAlign: "center",
            fontFamily: typography.fontFamily,
            fontSize: 16.5,
            fontWeight: "600",
            letterSpacing: -0.3,
            color: colors.fg,
          }}
        >
          {title}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 18, paddingBottom: bottomInset }}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}
