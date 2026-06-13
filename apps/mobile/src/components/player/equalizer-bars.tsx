import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/** Resting bar heights from the design (also the paused state). */
const RESTING_HEIGHTS = [10, 14, 7] as const;
const BAR_MIN = 3;
const BAR_MAX = 14;
const HALF_CYCLE_MS = 450;
const STAGGER_MS = 150;

interface EqualizerBarsProps {
  playing: boolean;
  color: string;
}

/** Three animated bars indicating active playback; frozen while paused. */
export function EqualizerBars({ playing, color }: EqualizerBarsProps) {
  return (
    <View testID="equalizer-bars" style={styles.row}>
      {RESTING_HEIGHTS.map((resting, i) => (
        <Bar
          key={i}
          playing={playing}
          color={color}
          restingHeight={resting}
          delayMs={i * STAGGER_MS}
        />
      ))}
    </View>
  );
}

function Bar({
  playing,
  color,
  restingHeight,
  delayMs,
}: {
  playing: boolean;
  color: string;
  restingHeight: number;
  delayMs: number;
}) {
  const height = useSharedValue(restingHeight);

  useEffect(() => {
    if (playing) {
      height.value = withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(BAR_MIN, {
              duration: HALF_CYCLE_MS,
              easing: Easing.inOut(Easing.ease),
            }),
            withTiming(BAR_MAX, {
              duration: HALF_CYCLE_MS,
              easing: Easing.inOut(Easing.ease),
            }),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(restingHeight, { duration: 200 });
    }
  }, [playing, delayMs, restingHeight, height]);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[styles.bar, { backgroundColor: color }, barStyle]} />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2.5,
    height: 14,
  },
  bar: {
    width: 2.5,
    borderRadius: 1,
    opacity: 0.9,
  },
});
