import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { StaccatoThemeProvider } from "@/theme";

// Hold the native splash until the first JS frame so it never flashes white.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <StaccatoThemeProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          // Screens own their entrance animation (stacScreenIn).
          animation: "none",
        }}
      />
    </StaccatoThemeProvider>
  );
}
