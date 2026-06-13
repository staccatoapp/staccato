import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SyncedLyricsLine } from "@staccato/shared";

import { getActiveLyricIndex } from "@/lib/playback";
import { PLAYER_EASING } from "./player-easing";

const VIEWPORT_HEIGHT = 320;
const LINE_HEIGHT = 44;
const FADE_RATIO = Math.round(VIEWPORT_HEIGHT * 0.14) / VIEWPORT_HEIGHT;

interface LyricsViewProps {
  lines: SyncedLyricsLine[];
  position: number;
}

/**
 * Synced lyrics: the latest line whose timestamp has passed is highlighted
 * and auto-centred in the viewport by translating the whole stack; other
 * lines dim with distance. Instrumental gaps are invisible spacers.
 */
export function LyricsView({ lines, position }: LyricsViewProps) {
  const activeIndex = getActiveLyricIndex(lines, position);
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  const offsetY = useSharedValue(centeredOffset(activeIndex, lineHeights));
  useEffect(() => {
    offsetY.value = withTiming(centeredOffset(activeIndex, lineHeights), {
      duration: 600,
      easing: PLAYER_EASING,
    });
  }, [activeIndex, offsetY, lineHeights]);

  const stackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offsetY.value }],
  }));

  const handleLineLayout = useCallback(
    (index: number, height: number) => {
      setLineHeights((prev) => {
        if (prev[index] === height) return prev;
        const next = [...prev];
        next[index] = height;
        return next;
      });
    },
    [],
  );

  return (
    <View testID="lyrics-view" style={styles.viewport}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            style={StyleSheet.absoluteFill}
            colors={["transparent", "white", "white", "transparent"]}
            locations={[0, FADE_RATIO, 1 - FADE_RATIO, 1]}
          />
        }
      >
        <Animated.View style={[styles.stack, stackStyle]}>
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const distance = Math.abs(i - activeIndex);
            const empty = line.lyrics === "";
            const opacity = empty
              ? 0
              : isActive
                ? 1
                : Math.max(0.32, 0.62 - distance * 0.06);
            return (
              <View
                key={`${line.startingTime}-${i}`}
                testID={`lyrics-line-${i}`}
                style={[styles.line, { opacity }]}
                onLayout={(e) => handleLineLayout(i, e.nativeEvent.layout.height)}
              >
                <Text
                  style={[
                    styles.lineText,
                    { color: isActive ? "#fff" : "rgba(255,255,255,0.85)" },
                  ]}
                >
                  {empty ? "·" : line.lyrics}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      </MaskedView>
    </View>
  );
}

function centeredOffset(activeIndex: number, heights: number[]): number {
  let sumBefore = 0;
  for (let i = 0; i < activeIndex; i++) {
    sumBefore += heights[i] ?? LINE_HEIGHT;
  }
  const activeHeight = heights[activeIndex] ?? LINE_HEIGHT;
  return VIEWPORT_HEIGHT / 2 - sumBefore - activeHeight / 2;
}

const styles = StyleSheet.create({
  viewport: {
    height: VIEWPORT_HEIGHT,
    width: "100%",
    overflow: "hidden",
  },
  stack: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  line: {
    minHeight: LINE_HEIGHT,
    justifyContent: "center",
    paddingVertical: 4,
  },
  lineText: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 29,
  },
});
