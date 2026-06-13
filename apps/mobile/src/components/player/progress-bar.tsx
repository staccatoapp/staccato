import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { formatPlayerTime } from "@/lib/playback";

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Scrubbable progress bar with elapsed / negative-remaining time labels.
 * While dragging, the bar tracks the finger locally; the seek is committed
 * once on release so scrubbing never floods the player or the server.
 */
export function ProgressBar({ position, duration, onSeek }: ProgressBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);

  const fraction =
    scrubFraction ?? (duration > 0 ? clamp01(position / duration) : 0);
  const displaySeconds =
    scrubFraction !== null ? scrubFraction * duration : position;

  const updateScrub = (x: number) => {
    if (trackWidth > 0) setScrubFraction(clamp01(x / trackWidth));
  };
  const commitScrub = (x: number) => {
    if (trackWidth > 0 && duration > 0) {
      onSeek(clamp01(x / trackWidth) * duration);
    }
    setScrubFraction(null);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(updateScrub)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(updateScrub)(e.x);
    })
    .onFinalize((e) => {
      runOnJS(commitScrub)(e.x);
    });

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          testID="progress-bar"
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          style={styles.hitArea}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <View style={styles.track}>
            <View
              testID="progress-bar-fill"
              style={[styles.fill, { width: `${fraction * 100}%` }]}
            />
            <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
          </View>
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        <Text style={styles.time}>{formatPlayerTime(displaySeconds)}</Text>
        <Text style={styles.time}>
          {`-${formatPlayerTime(Math.max(0, duration - displaySeconds))}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Taller invisible touch area around the 4px track.
  hitArea: {
    paddingVertical: 10,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  thumb: {
    position: "absolute",
    top: -4,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  time: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    fontVariant: ["tabular-nums"],
  },
});
