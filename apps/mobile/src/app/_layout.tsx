import { Colors } from "@staccato/shared";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { StaccatoThemeProvider } from "@/theme";

// Hold the native splash until the Inter font is ready, so the in-app splash
// never flashes a fallback font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: require("@/assets/fonts/Inter-VariableFont_opsz_wght.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

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
