import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { type HomeAlbum, type HomePlaylist } from "@/lib/home-types";
import { AlbumArt } from "@/components/home/album-art";
import { useTheme } from "@/theme";

const MAX_CELLS = 6;
const CELL_GAP = 8;

interface QuickStartGridProps {
  /** Mixed recent albums and playlists; only the first six render. */
  items: (HomeAlbum | HomePlaylist)[];
}

/** 2-column grid of shortcut tiles below the hero (or in its place). */
export function QuickStartGrid({ items }: QuickStartGridProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const cellWidth = (width - spacing.homeScreenPadding * 2 - CELL_GAP) / 2;

  return (
    <View
      style={[styles.grid, { paddingHorizontal: spacing.homeScreenPadding }]}
    >
      {items.slice(0, MAX_CELLS).map((item) => {
        const isAlbum = "title" in item;
        return (
          <View
            key={item.id}
            style={[
              styles.cell,
              {
                width: cellWidth,
                backgroundColor: colors.bgRaised,
                borderRadius: radius.quickStartCell,
                borderColor: colors.border,
              },
            ]}
          >
            <AlbumArt
              gradientKey={item.gradientKey}
              artUrl={isAlbum ? item.artUrl : undefined}
              artUrls={isAlbum ? undefined : item.artUrls}
              size={48}
              radius={radius.quickStartArt}
              glyphSize={18}
            />
            <View style={styles.textBlock}>
              <Text
                style={[
                  styles.title,
                  { color: colors.fg, fontFamily: typography.fontFamily },
                ]}
                numberOfLines={1}
              >
                {isAlbum ? item.title : item.name}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: colors.fgMuted, fontFamily: typography.fontFamily },
                ]}
                numberOfLines={1}
              >
                {isAlbum
                  ? item.artistName
                  : `Playlist · ${item.trackCount} tracks`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CELL_GAP,
    paddingTop: 16,
  },
  cell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 6,
    paddingRight: 10,
    overflow: "hidden",
    borderWidth: 0.5,
  },
  textBlock: {
    flexShrink: 1,
    flexGrow: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
});
