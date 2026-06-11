import { Gradients, type GradientKey } from "@staccato/shared";
import { Image } from "expo-image";
import { Music } from "lucide-react-native";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

interface AlbumArtProps {
  /** Placeholder gradient shown until real artwork exists. */
  gradientKey: GradientKey;
  /** Real artwork URL; when set it replaces the gradient + glyph. */
  artUrl?: string | null;
  /** Square side length in pt. */
  size?: number;
  /** Corner radius in pt. */
  radius?: number;
  /** Music glyph size; defaults to 28% of the art size. */
  glyphSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Album/playlist artwork tile from the home-screen handoff: a 135deg gradient
 * placeholder with a centred music glyph and a subtle top highlight, swapped
 * for the real artwork once `artUrl` is available.
 */
export function AlbumArt({
  gradientKey,
  artUrl,
  size = 120,
  radius = 10,
  glyphSize,
  style,
}: AlbumArtProps) {
  const [from, to] = Gradients[gradientKey];

  return (
    <View
      testID="album-art"
      style={[
        styles.root,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      {artUrl ? (
        <Image
          testID="album-art-image"
          source={{ uri: artUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.glyphWrap,
            {
              experimental_backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            },
          ]}
        >
          <View testID="album-art-glyph">
            <Music
              size={glyphSize ?? Math.round(size * 0.28)}
              color="rgba(255,255,255,0.18)"
              strokeWidth={1.6}
            />
          </View>
        </View>
      )}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.highlight]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    flexShrink: 0,
    boxShadow: "0 1px 2px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.25)",
  },
  glyphWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  highlight: {
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%)",
  },
});
