import { Colors } from "@staccato/shared";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerOverlayRoot } from "@/components/player-overlay";
import { SplashView } from "@/components/splash-view";
import { SessionProvider, useSession } from "@/lib/session";
import { PlaybackProvider } from "@/providers/playback-provider";
import { PreviewProvider } from "@/providers/preview-provider";
import { StaccatoThemeProvider } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch((err) =>
      console.warn("failed to hide splash screen", err),
    );
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <StaccatoThemeProvider>
          <StatusBar style="light" />
          {/* PlaybackProvider wraps both the navigator and the player overlay so
              screens (Explore previews, future "play" actions) can reach playback
              state, while the overlay stays an absolute sibling that floats over
              the native tab bar. */}
          <PlaybackRoot>
            <RootNavigator />
            <PlayerOverlayRoot />
          </PlaybackRoot>
        </StaccatoThemeProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Mounts the playback + preview providers once a session exists. Before sign-in
 * the auth screens don't use playback, so children render without the providers
 * (and the audio player isn't created). Mirrors the session gate the overlay and
 * data hooks already apply.
 */
function PlaybackRoot({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  if (isLoading || !session) return <>{children}</>;
  return (
    <PlaybackProvider>
      <PreviewProvider>{children}</PreviewProvider>
    </PlaybackProvider>
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
