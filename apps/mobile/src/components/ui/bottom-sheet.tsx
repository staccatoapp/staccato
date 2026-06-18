import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  PLAYER_EASING,
  SHEET_SLIDE_MS,
} from "@/components/player/player-easing";
import { useTheme } from "@/theme";

const OFFSCREEN = 700;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
  backdropTestID?: string;
}

export function BottomSheet({
  open,
  onClose,
  children,
  testID,
  backdropTestID,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const sheetY = useSharedValue(OFFSCREEN);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    sheetY.value = withTiming(open ? 0 : OFFSCREEN, {
      duration: SHEET_SLIDE_MS,
      easing: PLAYER_EASING,
    });
    backdropOpacity.value = withTiming(open ? 1 : 0, { duration: 300 });
  }, [open, sheetY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          testID={backdropTestID}
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </Animated.View>

      <Animated.View
        testID={testID}
        style={[styles.sheet, { backgroundColor: colors.bgRaised }, sheetStyle]}
      >
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 30,
    boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
  },
  handleWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
