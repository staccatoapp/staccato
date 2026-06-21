import { type GradientKey } from "@staccato/shared";
import React from "react";
import { Pressable, Text } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { useTheme } from "@/theme";

/**
 * Normalized, presentational shape for a square media tile (album or playlist).
 * Both the Home carousels and the Library grid map their own data into this so
 * the tile stays ignorant of the shared zod / Home view-model types.
 */
export interface MediaTileItem {
  id: string;
  title: string;
  subtitle: string;
  gradientKey: GradientKey;
  /** Single cover art; used when no mosaic is supplied. */
  artUrl?: string | null;
  /** Up to 4 cover arts; exactly 4 render as a 2x2 mosaic (see AlbumArt). */
  artUrls?: string[];
}

/**
 * Square artwork tile with a two-line title / subtitle caption, pressable to
 * open the item's detail screen. Shared between the Home carousels and the
 * Library grid; `size` is set by the caller (fixed carousel card vs grid column).
 */
export function MediaTile({
  item,
  size,
  onPress,
}: {
  item: MediaTileItem;
  size: number;
  onPress?: () => void;
}) {
  const { colors, radius, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={{ width: size }}
    >
      <AlbumArt
        gradientKey={item.gradientKey}
        artUrl={item.artUrl}
        artUrls={item.artUrls}
        size={size}
        radius={radius.carouselArt}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: colors.fg,
          marginTop: 8,
        }}
      >
        {item.title}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12,
          color: colors.fgMuted,
          marginTop: 1,
        }}
      >
        {item.subtitle}
      </Text>
    </Pressable>
  );
}
