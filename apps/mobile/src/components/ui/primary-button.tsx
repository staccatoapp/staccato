import { Check } from "lucide-react-native";
import React, { type PropsWithChildren } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";
import { Spinner } from "./spinner";

export type ButtonPhase = "idle" | "busy" | "ok";

interface PrimaryButtonProps {
  onPress: () => void;
  phase?: ButtonPhase;
  disabled?: boolean;
  busyLabel?: string;
  okLabel?: string;
}

/**
 * Primary action button. Idle: brand orange. Busy: spinner + busy label.
 * Ok: background morphs to green (250ms) with a check + ok label. The caller
 * owns the ok-hold-then-navigate timing.
 */
export function PrimaryButton({
  onPress,
  phase = "idle",
  disabled = false,
  busyLabel,
  okLabel,
  children,
}: PropsWithChildren<PrimaryButtonProps>) {
  const { colors, radius, spacing, typography } = useTheme();
  const busy = phase === "busy";
  const ok = phase === "ok";

  const backgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(ok ? colors.successButton : colors.primary, {
      duration: 250,
    }),
  }));

  const label = busy ? busyLabel : ok ? okLabel : children;

  return (
    <Animated.View
      style={[
        { borderRadius: radius.input, opacity: disabled ? 0.4 : 1 },
        backgroundStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        disabled={disabled || busy || ok}
        onPress={onPress}
        style={{
          height: spacing.controlHeight,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
        }}
      >
        {busy ? <Spinner size={17} /> : null}
        {ok ? <Check size={19} color={colors.fg} strokeWidth={2.6} /> : null}
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 16.5,
            fontWeight: "600",
            letterSpacing: -0.2,
            color: colors.fg,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
