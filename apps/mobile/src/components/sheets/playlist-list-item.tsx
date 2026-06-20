import { Plus } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlaylistListItem as PlaylistListItemData } from "@staccato/shared";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

const ART = 44;

interface PlaylistListItemProps {
  playlist: PlaylistListItemData;
  onPress: () => void;
  /** Greys the row and blocks taps while a save is in flight. */
  disabled?: boolean;
}

/**
 * One selectable playlist row for the add-to-playlist sheet: cover-art mosaic,
 * name, track count, and a trailing "add" glyph. Tapping adds the current track
 * (the parent owns the mutation); kept presentational so it stays reusable.
 */
export function PlaylistListItem({
  playlist,
  onPress,
  disabled,
}: PlaylistListItemProps) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add to ${playlist.name}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled ? 0.5 : 1 },
        pressed && !disabled ? { backgroundColor: colors.bgMuted } : null,
      ]}
    >
      <AlbumArt
        gradientKey={pickGradient(playlist.id)}
        artUrls={playlist.coverArtUrls}
        size={ART}
        radius={6}
      />
      <View style={styles.meta}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { color: colors.fg, fontFamily: typography.fontFamily },
          ]}
        >
          {playlist.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.subtitle,
            { color: colors.fgMuted, fontFamily: typography.fontFamily },
          ]}
        >
          {`${playlist.trackCount} tracks`}
        </Text>
      </View>
      <Plus size={20} color={colors.fgMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
});
