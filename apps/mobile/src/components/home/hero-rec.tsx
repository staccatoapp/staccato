import { Sparkles } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { type HomeRecPlaylist } from "@/lib/home-types";
import { useTheme } from "@/theme";

interface HeroRecProps {
  playlist: HomeRecPlaylist;
  onPress?: () => void;
}

/**
 * Full-width hero card for the recommended playlist. Shows a large version of
 * the playlist's cover art (a 2x2 mosaic when 4+ unique track arts exist), only
 * falling back to the gradient placeholder when no artwork is present. The whole
 * card is pressable and links to the playlist.
 */
export function HeroRec({ playlist, onPress }: HeroRecProps) {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <View
      style={[styles.root, { paddingHorizontal: spacing.homeScreenPadding }]}
    >
      <View style={styles.labelRow}>
        <Sparkles size={12} color={colors.primaryText} strokeWidth={2.4} />
        <Text
          style={[
            styles.label,
            { color: colors.primaryText, fontFamily: typography.fontFamily },
          ]}
        >
          RECOMMENDED FOR YOU
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playlist.name}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { borderRadius: radius.heroCard, opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <AlbumArt
          fill
          gradientKey={playlist.gradientKey}
          artUrl={playlist.artUrl}
          artUrls={playlist.artUrls}
          radius={radius.heroCard}
          glyphSize={48}
        />
        <View style={[StyleSheet.absoluteFill, styles.overlay]} />

        <View style={styles.bottomRow}>
          <View style={styles.textBlock}>
            <Text
              style={[styles.meta, { fontFamily: typography.fontFamily }]}
              numberOfLines={1}
            >
              Playlist · {playlist.trackCount} songs
            </Text>
            <Text
              style={[styles.name, { fontFamily: typography.fontFamily }]}
              numberOfLines={1}
            >
              {playlist.name}
            </Text>
            <Text
              style={[styles.artists, { fontFamily: typography.fontFamily }]}
              numberOfLines={1}
            >
              {playlist.artistSummary}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  card: {
    height: 220,
    overflow: "hidden",
    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
  },
  overlay: {
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.7) 100%)",
  },
  bottomRow: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
  },
  textBlock: {
    flexShrink: 1,
  },
  meta: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
    marginBottom: 6,
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: "#fff",
    marginBottom: 4,
  },
  artists: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
  },
});
