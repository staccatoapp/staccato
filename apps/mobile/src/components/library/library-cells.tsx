import { type Artist } from "@staccato/shared";
import React from "react";
import { Pressable, Text } from "react-native";

import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

import { ArtistAvatar } from "./artist-avatar";

/** Artist grid cell: centered round avatar + name. */
export function ArtistCell({
  artist,
  size,
  onPress,
}: {
  artist: Artist;
  size: number;
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: size, alignItems: "center" }}>
      <ArtistAvatar
        name={artist.name}
        imageUrl={artist.imageUrl}
        gradientKey={pickGradient(artist.id)}
        size={size}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: colors.fg,
          marginTop: 6,
          textAlign: "center",
          maxWidth: "100%",
        }}
      >
        {artist.name}
      </Text>
    </Pressable>
  );
}
