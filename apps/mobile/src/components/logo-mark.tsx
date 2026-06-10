import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { useTheme } from "@/theme";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Bar geometry for the logo: [x, y, height], width 6, rx 1.5,
// all bars vertically centred on y=32 in a 64-viewBox.
const BARS: readonly [number, number, number][] = [
  [7, 21, 22],
  [18, 15, 34],
  [29, 24, 16],
  [40, 10, 44],
  [51, 20, 24],
];

const PULSE_HALF_MS = 750;
const PULSE_STAGGER_MS = 120;

interface PulsingBarProps {
  x: number;
  y: number;
  height: number;
  index: number;
  pulse: boolean;
}

function PulsingBar({ x, y, height, index, pulse }: PulsingBarProps) {
  const scale = useSharedValue(1);
  const midY = y + height / 2;

  useEffect(() => {
    if (!pulse) {
      scale.value = 1;
      return;
    }
    // scaleY 1 -> 1.3 -> 1 loop, staggered per bar — the staccato equalizer.
    scale.value = withDelay(
      index * PULSE_STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1.3, {
            duration: PULSE_HALF_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, {
            duration: PULSE_HALF_MS,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
      ),
    );
  }, [index, pulse, scale]);

  // RN SVG has no transform-origin, so scale around the bar's own centre by
  // animating y/height directly.
  const animatedProps = useAnimatedProps(() => {
    const scaledHeight = height * scale.value;
    return {
      y: midY - scaledHeight / 2,
      height: scaledHeight,
    };
  });

  return (
    <AnimatedRect x={x} width={6} rx={1.5} animatedProps={animatedProps} />
  );
}

interface LogoMarkProps {
  size?: number;
  color?: string;
  pulse?: boolean;
}

/** The five-bar Staccato glyph; optionally pulses like an equalizer. */
export function LogoMark({ size = 64, color, pulse = false }: LogoMarkProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const animate = pulse && !reducedMotion;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill={color ?? colors.primary}
      accessibilityLabel="Staccato"
    >
      {BARS.map(([x, y, h], i) => (
        <PulsingBar key={x} x={x} y={y} height={h} index={i} pulse={animate} />
      ))}
    </Svg>
  );
}
