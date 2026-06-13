import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Pause, Play, SkipForward } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { usePlayback } from "@/providers/playback-provider";
import { useTheme } from "@/theme";

/** Design surface: oklch(0.24 0 0 / 92%) converted to sRGB. */
const CARD_BACKGROUND = "rgba(31,31,31,0.92)";
/** Opaque-ish fallback when no glass material is available. */
const CARD_BACKGROUND_FALLBACK = "rgba(31,31,31,0.96)";

/**
 * Persistent playback card floating above the tab bar. The whole surface
 * opens the Now Playing view; the two buttons swallow their taps.
 */
export function MiniPlayer() {
  const { colors } = useTheme();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    setPlayerOpen,
    togglePlay,
    next,
  } = usePlayback();

  if (!currentTrack) return null;

  const progress =
    duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  return (
    <Pressable
      testID="mini-player"
      accessibilityRole="button"
      accessibilityLabel="Open full screen player"
      onPress={() => setPlayerOpen(true)}
      style={[styles.card, { borderColor: colors.borderStrong }]}
    >
      {isLiquidGlassAvailable() ? (
        <GlassView
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: CARD_BACKGROUND },
          ]}
          isInteractive={false}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: CARD_BACKGROUND_FALLBACK },
          ]}
        />
      )}

      <View style={styles.row}>
        <AlbumArt
          gradientKey={pickGradient(currentTrack.id)}
          artUrl={currentTrack.coverArtUrl}
          size={42}
          radius={6}
          glyphSize={16}
        />
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.fg }]}>
            {currentTrack.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.artist, { color: colors.fgMuted }]}
          >
            {currentTrack.artistName ?? "Unknown Artist"}
          </Text>
        </View>
        <Pressable
          testID="mini-player-play-pause"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          onPress={togglePlay}
          style={styles.controlButton}
        >
          {isPlaying ? (
            <View testID="mini-player-pause-icon">
              <Pause size={20} color={colors.fg} fill={colors.fg} />
            </View>
          ) : (
            <View testID="mini-player-play-icon">
              <Play size={20} color={colors.fg} fill={colors.fg} />
            </View>
          )}
        </Pressable>
        <Pressable
          testID="mini-player-next"
          accessibilityRole="button"
          accessibilityLabel="Next track"
          onPress={next}
          style={styles.controlButton}
        >
          <SkipForward size={20} color={colors.fg} fill={colors.fg} />
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <View
          testID="mini-player-progress-fill"
          style={[
            styles.progressFill,
            { width: `${progress * 100}%`, backgroundColor: colors.fg },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 0.5,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  controlButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: 12,
    marginTop: 1,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: "100%",
    opacity: 0.85,
  },
});
