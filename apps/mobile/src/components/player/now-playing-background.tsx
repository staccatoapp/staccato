import { Image } from "expo-image";
import { Platform, StyleSheet, View } from "react-native";
import { Gradients, type GradientKey } from "@staccato/shared";

import { resolveImageSource } from "@/lib/image-source";
import { useSession } from "@/lib/session";

/**
 * Apple-Music-style ambient wash: the album art bled past every edge, scaled
 * up and heavily blurred, under a darkening gradient for legibility. Android's
 * blur is much weaker than iOS's, so it gets a smaller radius and a heavier
 * darkening overlay to compensate.
 */
const BLUR_RADIUS = Platform.OS === "ios" ? 80 : 25;
const DARKEN_OVERLAY =
  Platform.OS === "ios"
    ? "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.72) 100%)"
    : "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 100%)";

interface NowPlayingBackgroundProps {
  artUrl: string | null;
  gradientKey: GradientKey;
}

export function NowPlayingBackground({
  artUrl,
  gradientKey,
}: NowPlayingBackgroundProps) {
  const { session } = useSession();
  const source = resolveImageSource(artUrl, session?.serverUrl, session?.token);
  const [from, to] = Gradients[gradientKey];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {source ? (
        <Image
          source={source}
          style={[styles.bleed, { transform: [{ scale: 1.3 }] }]}
          contentFit="cover"
          blurRadius={BLUR_RADIUS}
        />
      ) : (
        <View
          style={[
            styles.bleed,
            {
              experimental_backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            },
          ]}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { experimental_backgroundImage: DARKEN_OVERLAY },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    position: "absolute",
    top: -80,
    left: -80,
    right: -80,
    bottom: -80,
  },
});
