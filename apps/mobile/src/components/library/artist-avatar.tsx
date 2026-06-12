import { Gradients, type GradientKey } from "@staccato/shared";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { StaccatoImage } from "@/components/staccato-image";
import { useTheme } from "@/theme";

interface ArtistAvatarProps {
  name: string;
  imageUrl?: string | null;
  gradientKey: GradientKey;
  size: number;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * Round artist disc — the artist photo when available, else a gradient disc
 * with centered initials. Mirrors the square `AlbumArt` shadow/highlight.
 */
export function ArtistAvatar({
  name,
  imageUrl,
  gradientKey,
  size,
}: ArtistAvatarProps) {
  const { typography } = useTheme();
  const [from, to] = Gradients[gradientKey];
  const gradientFill = `linear-gradient(135deg, ${from}, ${to})`;

  const fallback = (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { experimental_backgroundImage: gradientFill },
      ]}
    >
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: Math.round(size * 0.28),
          fontWeight: "700",
          letterSpacing: 0.5,
          color: "rgba(255,255,255,0.85)",
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <StaccatoImage
        uri={imageUrl}
        fallback={fallback}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
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
    boxShadow: "0 1px 2px rgba(0,0,0,0.35), 0 6px 18px rgba(0,0,0,0.2)",
  },
  center: { alignItems: "center", justifyContent: "center" },
  highlight: {
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 55%)",
  },
});
