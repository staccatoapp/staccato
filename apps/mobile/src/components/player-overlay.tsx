import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/player/mini-player";
import { NowPlayingPanel } from "@/components/player/now-playing-panel";
import { MINI_PLAYER_INSET, TAB_BAR_CONTENT_HEIGHT } from "@/lib/player-layout";
import { useSession } from "@/lib/session";
import { usePlayback } from "@/providers/playback-provider";

/**
 * Root-level mount for the player UI. Lives as an absolute sibling of the
 * navigator (not inside the tab layout) so the mini player can float over the
 * native tab bar and the Now Playing panel can cover it entirely. The
 * PlaybackProvider that backs it is mounted a level up (see app/_layout.tsx) so
 * screens can drive playback too; here we only render the overlay once a session
 * exists (and thus the provider is present).
 */
export function PlayerOverlayRoot() {
  const { session, isLoading } = useSession();
  if (isLoading || !session) return null;
  return <PlayerOverlay />;
}

function PlayerOverlay() {
  const insets = useSafeAreaInsets();
  const { isPlayerOpen } = usePlayback();

  // Mini player fades out and drifts down while the full player is up.
  const miniOpacity = useSharedValue(1);
  const miniTranslateY = useSharedValue(0);
  useEffect(() => {
    miniOpacity.value = withTiming(isPlayerOpen ? 0 : 1, { duration: 250 });
    miniTranslateY.value = withTiming(isPlayerOpen ? 8 : 0, { duration: 300 });
  }, [isPlayerOpen, miniOpacity, miniTranslateY]);

  const miniStyle = useAnimatedStyle(() => ({
    opacity: miniOpacity.value,
    transform: [{ translateY: miniTranslateY.value }],
  }));

  const miniBottom = insets.bottom + TAB_BAR_CONTENT_HEIGHT + MINI_PLAYER_INSET;

  return (
    <Animated.View
      testID="player-overlay"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[styles.miniPlayerWrap, { bottom: miniBottom }, miniStyle]}
        pointerEvents={isPlayerOpen ? "none" : "box-none"}
      >
        <MiniPlayer />
      </Animated.View>
      <NowPlayingPanel />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  miniPlayerWrap: {
    position: "absolute",
    left: MINI_PLAYER_INSET,
    right: MINI_PLAYER_INSET,
  },
});
