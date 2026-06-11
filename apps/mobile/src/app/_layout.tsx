import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { SplashView } from "@/components/splash-view";
import { SessionProvider, useSession } from "@/lib/session";
import { StaccatoThemeProvider } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch((err) =>
      console.warn("failed to hide splash screen", err),
    );
  }, []);

  return (
    <SessionProvider>
      <StaccatoThemeProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </StaccatoThemeProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <SplashView />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
        // Screens own their entrance animation (stacScreenIn).
        animation: "none",
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(home)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
