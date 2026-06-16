import { ChevronLeft, MoreHorizontal } from "lucide-react-native";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import {
  contentFadeInputRange,
  heroCollapseDistance,
  titleFadeInputRange,
} from "@/lib/hero-collapse";
import { useContentBottomInset } from "@/lib/player-layout";
import { useTheme } from "@/theme";

interface DetailHeroLayoutProps {
  title: string;
  /** [from, to] colours — caller derives via Gradients[pickGradient(key)]. */
  gradientColors: readonly [string, string];
  onBack: () => void;
  /** AlbumHero or PlaylistHero — rendered without gradient/back button. */
  hero: React.ReactNode;
  /** Track list and any footer content. */
  children: React.ReactNode;
}

export function DetailHeroLayout({
  title,
  gradientColors,
  onBack,
  hero,
  children,
}: DetailHeroLayoutProps) {
  const [from, to] = gradientColors;
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: false });

  const scrollY = useSharedValue(0);
  // Measured via onLayout after first paint; 600 is a safe initial estimate.
  const [heroHeight, setHeroHeight] = useState(600);
  const collapsedHeight = insets.top + 50;

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Interpolation ranges are derived on the JS thread (the helpers are plain
  // functions, not worklets) and captured as plain numbers in the worklets
  // below — only `interpolate` itself runs on the UI thread. heroHeight changes
  // on re-render, which re-runs these and re-creates the worklets.
  const distance = heroCollapseDistance(heroHeight, collapsedHeight);
  const contentRange = contentFadeInputRange(distance);
  const titleRange = titleFadeInputRange(distance);

  // Backdrop gradient translates up 1:1 with the scroll, then clamps so its
  // bottom `collapsedHeight` band stays pinned as the sticky bar.
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, distance],
          [0, -distance],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Entire hero (art, title, actions) fades out uniformly as it scrolls up.
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      contentRange,
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Sticky bar fades in over the final stretch, as the backdrop clamps.
  const stickyBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      titleRange,
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // Collapsed title fades in and nudges up over the same stretch.
  const collapsedTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      titleRange,
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          titleRange,
          [8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const onHeroLayout = (e: LayoutChangeEvent) => {
    setHeroHeight(e.nativeEvent.layout.height);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* ① Backdrop gradient — behind the scroll view; translates up with scroll. */}
      <Animated.View
        style={[styles.backdrop, { height: heroHeight }, backdropStyle]}
        pointerEvents="none"
      >
        <GradientStack from={from} to={to} bg={colors.bg} />
      </Animated.View>

      {/* ② Scroll view — above the backdrop; transparent so gradient shows through. */}
      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <Animated.View onLayout={onHeroLayout} style={heroContentStyle}>
          {hero}
        </Animated.View>
        {children}
      </Animated.ScrollView>

      {/* ③ Sticky bar — in front of the scroll view so rows scroll under it. Shows
          the gradient's bottom band, matching the clamped backdrop seamlessly. */}
      <Animated.View
        style={[styles.stickyBar, { height: collapsedHeight }, stickyBarStyle]}
        pointerEvents="none"
      >
        <View
          style={{
            height: heroHeight,
            marginTop: collapsedHeight - heroHeight,
          }}
        >
          <GradientStack from={from} to={to} bg={colors.bg} />
        </View>
      </Animated.View>

      {/* ④ Back button — always visible. */}
      <View
        style={[styles.backButtonWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={styles.ghostNav}
        >
          <ChevronLeft size={24} color="#fff" strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* ⑤ More button — always visible, mirrors the back button. Stub. */}
      <View
        style={[styles.moreButtonWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          hitSlop={8}
          style={styles.ghostNav}
        >
          <MoreHorizontal size={20} color="#fff" />
        </Pressable>
      </View>

      {/* ⑥ Collapsed title — fades in above the sticky bar. */}
      <Animated.View
        style={[
          styles.collapsedTitle,
          { top: insets.top + 6, height: 36 },
          collapsedTitleStyle,
        ]}
        pointerEvents="none"
      >
        <Text
          numberOfLines={1}
          style={[
            styles.collapsedTitleText,
            { fontFamily: typography.fontFamily },
          ]}
        >
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

/** The three stacked gradient layers used by both the backdrop and sticky bar. */
function GradientStack({
  from,
  to,
  bg,
}: {
  from: string;
  to: string;
  bg: string;
}) {
  return (
    <>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(160deg, ${from}, ${to})`,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 42%)",
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.14) 34%, rgba(0,0,0,0.46) 66%, ${bg} 100%)`,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  scroll: {
    flex: 1,
    backgroundColor: "transparent",
  },
  stickyBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  backButtonWrap: {
    position: "absolute",
    left: 18,
  },
  moreButtonWrap: {
    position: "absolute",
    right: 18,
  },
  ghostNav: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedTitle: {
    position: "absolute",
    left: 60,
    right: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedTitleText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
});
