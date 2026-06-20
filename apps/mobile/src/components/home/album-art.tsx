import { Gradients, type GradientKey } from "@staccato/shared";
import { Music } from "lucide-react-native";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { StaccatoImage } from "@/components/staccato-image";

interface AlbumArtProps {
  /** Placeholder gradient shown until real artwork exists. */
  gradientKey: GradientKey;
  /** Real artwork URL; when set it replaces the gradient + glyph. */
  artUrl?: string | null;
  /**
   * Up to 4 cover arts. Exactly 4 render as a 2x2 mosaic; otherwise the first
   * is used as the single tile (falling back to `artUrl`).
   */
  artUrls?: string[];
  /** Square side length in pt. */
  size?: number;
  /**
   * Fill the parent container instead of rendering a fixed `size` square — used
   * by the wide Home hero. Pass an explicit `glyphSize` when filling.
   */
  fill?: boolean;
  /** Corner radius in pt. */
  radius?: number;
  /** Music glyph size; defaults to 28% of the art size. */
  glyphSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Album/playlist artwork tile from the home-screen handoff: a 135deg gradient
 * placeholder with a centred music glyph and a subtle top highlight, swapped
 * for the real artwork once `artUrl` is available. When given exactly 4
 * `artUrls`, renders them as a 2x2 mosaic (Spotify/Apple Music style).
 */
export function AlbumArt({
  gradientKey,
  artUrl,
  artUrls,
  size = 120,
  fill = false,
  radius = 10,
  glyphSize,
  style,
}: AlbumArtProps) {
  const [from, to] = Gradients[gradientKey];
  const gradientFill = `linear-gradient(135deg, ${from}, ${to})`;
  const isMosaic = (artUrls?.length ?? 0) === 4;

  // Gradient + glyph placeholder, shown until real artwork loads (and again if
  // it fails). StaccatoImage owns fetching/auth; AlbumArt owns how it looks.
  const placeholder = (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.glyphWrap,
        { experimental_backgroundImage: gradientFill },
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
  );

  return (
    <View
      testID="album-art"
      style={[
        styles.root,
        fill
          ? {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: radius,
            }
          : { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      {isMosaic ? (
        <View style={[StyleSheet.absoluteFill, styles.mosaic]}>
          {artUrls!.map((uri, i) => (
            <StaccatoImage
              key={`${uri}-${i}`}
              testID="album-art-image"
              uri={uri}
              fallback={
                <View
                  style={[
                    styles.quadrant,
                    { experimental_backgroundImage: gradientFill },
                  ]}
                />
              }
              style={styles.quadrant}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <StaccatoImage
          testID="album-art-image"
          uri={artUrl ?? artUrls?.[0]}
          fallback={placeholder}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
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
  mosaic: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  quadrant: {
    width: "50%",
    height: "50%",
  },
  highlight: {
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%)",
  },
});
