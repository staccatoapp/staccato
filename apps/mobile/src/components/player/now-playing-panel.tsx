import { ChevronDown, Ellipsis, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gradients } from "@staccato/shared";
import type { PlaybackTrack } from "@staccato/shared";

import { StaccatoImage } from "@/components/staccato-image";
import { useLyrics } from "@/hooks/use-lyrics";
import { pickGradient } from "@/lib/gradient";
import { usePlayback } from "@/providers/playback-provider";
import { LyricsView } from "./lyrics-view";
import { NowPlayingBackground } from "./now-playing-background";
import { PANEL_SLIDE_MS, PLAYER_EASING } from "./player-easing";
import { ProgressBar } from "./progress-bar";
import { QueueSheet } from "./queue-sheet";
import { TransportControls } from "./transport-controls";
import { UtilityPills } from "./utility-pills";

/** Drag distance / fling velocity past which a swipe-down dismisses. */
const DISMISS_DRAG_PX = 120;
const DISMISS_VELOCITY = 600;

/**
 * Full-screen player sheet. Slides up over everything (tab bar included),
 * collapses via the chevron or a swipe down. The centre stage swaps between
 * album art and synced lyrics; the Up Next queue opens as a sheet on top.
 */
export function NowPlayingPanel() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    isPlayerOpen,
    setPlayerOpen,
    seekTo,
  } = usePlayback();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<"player" | "lyrics">("player");
  const [queueOpen, setQueueOpen] = useState(false);

  const lyricsQuery = useLyrics(currentTrack?.id);
  const syncedLyrics = lyricsQuery.data?.syncedLyrics ?? null;
  const lyricsAvailable = !!syncedLyrics && syncedLyrics.length > 0;
  const showLyrics = view === "lyrics" && lyricsAvailable;

  const panelY = useSharedValue(screenHeight);
  useEffect(() => {
    panelY.value = withTiming(isPlayerOpen ? 0 : screenHeight, {
      duration: PANEL_SLIDE_MS,
      easing: PLAYER_EASING,
    });
  }, [isPlayerOpen, screenHeight, panelY]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  const close = () => setPlayerOpen(false);

  // The gesture callbacks are Reanimated worklets running on the UI thread,
  // not render-phase code — writing the shared value there is the supported
  // pattern, but the React Compiler lint can't tell worklets apart.
  const swipeDown = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      panelY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG_PX || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(close)();
      } else {
        // eslint-disable-next-line react-hooks/immutability
        panelY.value = withTiming(0, {
          duration: 300,
          easing: PLAYER_EASING,
        });
      }
    });

  if (!currentTrack) return null;

  return (
    <Animated.View
      testID="now-playing-panel"
      style={[StyleSheet.absoluteFill, panelStyle, { overflow: "hidden" }]}
      pointerEvents={isPlayerOpen ? "auto" : "none"}
    >
      <NowPlayingBackground
        artUrl={currentTrack.coverArtUrl}
        gradientKey={pickGradient(currentTrack.id)}
      />

      <GestureDetector gesture={swipeDown}>
        <View
          style={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 28) + 14,
              paddingBottom: Math.max(insets.bottom, 22),
            },
          ]}
        >
          <View style={styles.dragHandle} />

          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable
              testID="now-playing-close"
              accessibilityRole="button"
              accessibilityLabel="Collapse player"
              onPress={close}
              style={styles.topBarButton}
            >
              <ChevronDown size={26} color="#fff" strokeWidth={2.4} />
            </Pressable>
            <View style={styles.topBarCenter}>
              <Text style={styles.eyebrow}>PLAYING FROM ALBUM</Text>
              {currentTrack.albumTitle ? (
                <Text numberOfLines={1} style={styles.albumTitle}>
                  {currentTrack.albumTitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options (coming soon)"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.topBarButton}
            >
              <Ellipsis size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Centre stage: art or lyrics */}
          <View style={styles.centerStage}>
            {showLyrics && syncedLyrics ? (
              <LyricsView lines={syncedLyrics} position={position} onSeek={seekTo} />
            ) : (
              <NowPlayingArt track={currentTrack} playing={isPlaying} />
            )}
          </View>

          {/* Track meta */}
          <View style={styles.metaRow}>
            <View style={styles.metaText}>
              <Text numberOfLines={1} style={styles.trackTitle}>
                {currentTrack.title}
              </Text>
              <Text numberOfLines={1} style={styles.trackArtist}>
                {currentTrack.artistName ?? "Unknown Artist"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to playlist (coming soon)"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.plusButton}
            >
              <Plus
                size={24}
                color="rgba(255,255,255,0.85)"
                strokeWidth={2.2}
              />
            </Pressable>
          </View>

          <ProgressBar
            position={position}
            duration={duration}
            onSeek={seekTo}
          />

          <TransportControls />

          <UtilityPills
            lyricsAvailable={lyricsAvailable}
            lyricsActive={showLyrics}
            onToggleLyrics={() =>
              setView((v) => (v === "lyrics" ? "player" : "lyrics"))
            }
            onOpenQueue={() => setQueueOpen(true)}
          />
        </View>
      </GestureDetector>

      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
    </Animated.View>
  );
}

function NowPlayingArt({
  track,
  playing,
}: {
  track: PlaybackTrack;
  playing: boolean;
}) {
  const scale = useSharedValue(playing ? 1 : 0.86);
  useEffect(() => {
    // Apple Music behaviour: the art breathes down to 86% while paused.
    scale.value = withTiming(playing ? 1 : 0.86, {
      duration: 500,
      easing: PLAYER_EASING,
    });
  }, [playing, scale]);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const [from, to] = Gradients[pickGradient(track.id)];

  return (
    <Animated.View testID="now-playing-art" style={[artStyles.art, scaleStyle]}>
      <StaccatoImage
        uri={track.coverArtUrl}
        fallback={
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                experimental_backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
              },
            ]}
          />
        }
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, artStyles.highlight]}
      />
    </Animated.View>
  );
}

const artStyles = StyleSheet.create({
  art: {
    width: "100%",
    maxWidth: 300,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.35)",
  },
  highlight: {
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 40%)",
  },
});

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 22,
  },
  dragHandle: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.28)",
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  topBarButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.65)",
  },
  albumTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    color: "#fff",
  },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 14,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: "#fff",
  },
  trackArtist: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
  },
  plusButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
});
