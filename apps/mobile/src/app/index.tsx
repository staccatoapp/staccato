import { router } from "expo-router";
import React, { useEffect } from "react";
import { Text, View } from "react-native";

import { LogoMark } from "@/components/logo-mark";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";
import { resolveStartRoute } from "@/lib/start-route";
import { useTheme } from "@/theme";

/** Minimum dwell so the splash never flashes. */
const MIN_DWELL_MS = 800;

const WORDMARK_SIZE = 32;

export default function SplashScreen() {
  const { colors, typography } = useTheme();

  useEffect(() => {
    let cancelled = false;
    const dwell = new Promise((resolve) => setTimeout(resolve, MIN_DWELL_MS));
    Promise.all([resolveStartRoute(), dwell]).then(([route]) => {
      if (!cancelled) {
        router.replace(route);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen variant="fade">
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <LogoMark size={72} pulse />
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: WORDMARK_SIZE,
            fontWeight: "700",
            letterSpacing: WORDMARK_SIZE * -0.032,
            color: colors.fg,
            lineHeight: WORDMARK_SIZE,
          }}
        >
          Staccato
        </Text>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: 72,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
        }}
      >
        <Spinner size={13} color={colors.fgSubtle} />
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 13,
            letterSpacing: -0.1,
            color: colors.fgSubtle,
          }}
        >
          Checking your session…
        </Text>
      </View>
    </Screen>
  );
}
