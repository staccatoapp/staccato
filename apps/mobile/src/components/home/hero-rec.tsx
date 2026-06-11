import { Gradients } from "@staccato/shared";
import { Play, Sparkles } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type HomeRecPlaylist } from "@/lib/home-data";
import { useTheme } from "@/theme";

interface HeroRecProps {
  playlist: HomeRecPlaylist;
  onPlay?: () => void;
}

/** Full-width hero card for the recommended playlist. */
export function HeroRec({ playlist, onPlay }: HeroRecProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [from, to] = Gradients[playlist.gradientKey];

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

      <View
        style={[
          styles.card,
          {
            borderRadius: radius.heroCard,
            experimental_backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
          },
        ]}
      >
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play"
            onPress={onPlay}
            style={({ pressed }) => [
              styles.playButton,
              { backgroundColor: pressed ? colors.primaryDim : colors.primary },
            ]}
          >
            <Play size={22} color="#fff" fill="#fff" style={styles.playIcon} />
          </Pressable>
        </View>
      </View>
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
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
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
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
  },
  playIcon: {
    marginLeft: 2,
  },
});
