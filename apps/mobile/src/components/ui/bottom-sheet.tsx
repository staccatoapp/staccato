import React, { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
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
const DISMISS_DRAG_PX = 120;
const DISMISS_VELOCITY = 600;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
  backdropTestID?: string;
  style?: StyleProp<ViewStyle>;
}

export function BottomSheet({
  open,
  onClose,
  children,
  testID,
  backdropTestID,
  style,
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

  const swipeDown = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      sheetY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG_PX || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        // eslint-disable-next-line react-hooks/immutability
        sheetY.value = withTiming(0, {
          duration: SHEET_SLIDE_MS,
          easing: PLAYER_EASING,
        });
      }
    });

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
        style={[
          styles.sheet,
          { backgroundColor: colors.bgRaised },
          sheetStyle,
          style,
        ]}
      >
        <GestureDetector gesture={swipeDown}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>
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
    paddingHorizontal: 20,
    paddingBottom: 30,
    boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
