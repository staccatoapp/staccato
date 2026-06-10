import React, { type PropsWithChildren } from "react";
import { ScrollView } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useReducedMotion,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

interface ScreenProps {
  /** "slide" = fade + 14px upward slide (default); "fade" = plain fade (splash). */
  variant?: "slide" | "fade";
  scroll?: boolean;
  /** Bottom padding for scrollable content. */
  contentPaddingBottom?: number;
}

const SCREEN_IN_EASING = Easing.bezier(0.2, 0.7, 0.3, 1);

/** Full-bleed screen container with the stacScreenIn entrance animation. */
export function Screen({
  variant = "slide",
  scroll = false,
  contentPaddingBottom = 40,
  children,
}: PropsWithChildren<ScreenProps>) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const entering = reducedMotion
    ? undefined
    : variant === "fade"
      ? FadeIn.duration(500)
      : FadeIn.duration(420)
          .easing(SCREEN_IN_EASING.factory())
          .withInitialValues({ transform: [{ translateY: 14 }] });

  return (
    <Animated.View
      entering={entering}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </Animated.View>
  );
}
