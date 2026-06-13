import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type { SyncedLyricsLine } from "@staccato/shared";

import { getActiveLyricIndex } from "@/lib/playback";
import { useLyricsScroll } from "./use-lyrics-scroll";

const VIEWPORT_HEIGHT = 320;
const LINE_HEIGHT = 44;
const FADE_RATIO = Math.round(VIEWPORT_HEIGHT * 0.14) / VIEWPORT_HEIGHT;

interface LyricsViewProps {
  lines: SyncedLyricsLine[];
  position: number;
  onSeek?: (seconds: number) => void;
}

export function LyricsView({ lines, position, onSeek }: LyricsViewProps) {
  const activeIndex = getActiveLyricIndex(lines, position);
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  const { scrollRef, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollEnd, onScroll } =
    useLyricsScroll({ activeIndex, lineHeights, viewportHeight: VIEWPORT_HEIGHT });

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
        <ScrollView
          ref={scrollRef}
          testID="lyrics-scroll-view"
          style={StyleSheet.absoluteFill}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        >
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const distance = Math.abs(i - activeIndex);
            const empty = line.lyrics === "";
            const opacity = empty
              ? 0
              : isActive
                ? 1
                : Math.max(0.32, 0.62 - distance * 0.06);
            const content = (
              <Text
                style={[
                  styles.lineText,
                  { color: isActive ? "#fff" : "rgba(255,255,255,0.85)" },
                ]}
              >
                {empty ? "·" : line.lyrics}
              </Text>
            );
            return (
              <View
                key={`${line.startingTime}-${i}`}
                testID={`lyrics-line-${i}`}
                style={[styles.line, { opacity }]}
                onLayout={(e) => handleLineLayout(i, e.nativeEvent.layout.height)}
              >
                {!empty && onSeek ? (
                  <Pressable onPress={() => onSeek(line.startingTime)}>
                    {content}
                  </Pressable>
                ) : (
                  content
                )}
              </View>
            );
          })}
        </ScrollView>
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    height: VIEWPORT_HEIGHT,
    width: "100%",
    overflow: "hidden",
  },
  contentContainer: {
    paddingVertical: VIEWPORT_HEIGHT / 2,
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
