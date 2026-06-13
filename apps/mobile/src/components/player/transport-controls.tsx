import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { usePlayback } from "@/providers/playback-provider";

const IDLE_CONTROL_COLOR = "rgba(255,255,255,0.88)";

/**
 * Main transport row: shuffle · prev · play/pause · next · repeat.
 * Shuffle and repeat are rendered but disabled — the server
 * playback session has no shuffle/repeat state yet.
 */
export function TransportControls() {
  const { isPlaying, togglePlay, next, prev } = usePlayback();

  return (
    <View style={styles.row}>
      <Pressable
        testID="transport-shuffle"
        accessibilityRole="button"
        accessibilityLabel="Shuffle (coming soon)"
        accessibilityState={{ disabled: true }}
        disabled
        style={[styles.sideButton, styles.disabled]}
      >
        <Shuffle size={18} color={IDLE_CONTROL_COLOR} strokeWidth={2.2} />
      </Pressable>

      <Pressable
        testID="transport-prev"
        accessibilityRole="button"
        accessibilityLabel="Previous track"
        onPress={prev}
        style={styles.skipButton}
      >
        <SkipBack size={32} color="#fff" fill="#fff" />
      </Pressable>

      <Pressable
        testID="transport-play-pause"
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        onPress={togglePlay}
        style={styles.playButton}
      >
        {isPlaying ? (
          <View testID="transport-pause-icon">
            <Pause size={26} color="#000" fill="#000" />
          </View>
        ) : (
          <View testID="transport-play-icon" style={styles.playGlyphOffset}>
            <Play size={26} color="#000" fill="#000" />
          </View>
        )}
      </Pressable>

      <Pressable
        testID="transport-next"
        accessibilityRole="button"
        accessibilityLabel="Next track"
        onPress={next}
        style={styles.skipButton}
      >
        <SkipForward size={32} color="#fff" fill="#fff" />
      </Pressable>

      <Pressable
        testID="transport-repeat"
        accessibilityRole="button"
        accessibilityLabel="Repeat (coming soon)"
        accessibilityState={{ disabled: true }}
        disabled
        style={[styles.sideButton, styles.disabled]}
      >
        <Repeat size={18} color={IDLE_CONTROL_COLOR} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 10,
  },
  sideButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  skipButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  },
  // Optical centring: the play triangle reads centred 3px right of true centre.
  playGlyphOffset: {
    marginLeft: 3,
  },
});
