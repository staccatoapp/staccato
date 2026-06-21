import type { RecommendedPlaylist } from "@staccato/shared";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { AvailabilityBadge } from "@/components/ui/availability-badge";
import { availabilityFromCounts } from "@/lib/availability";
import { pickGradient } from "@/lib/gradient";
import { mosaicArtFromTracks } from "@/lib/mosaic-art";
import { useTheme } from "@/theme";

import { SectionHeader } from "./section-header";

const CARD_SIZE = 172;
const CARD_GAP = 14;

/** Human label for a playlist's recommendation source. */
function sourceLabel(source: RecommendedPlaylist["source"]): string {
  return source === "listenbrainz" ? "ListenBrainz" : "Staccato";
}

interface PlaylistCarouselProps {
  playlists: RecommendedPlaylist[];
  onPressPlaylist?: (playlist: RecommendedPlaylist) => void;
}

/** "Recommended playlists" header + horizontal snap carousel of square cards. */
export function PlaylistCarousel({
  playlists,
  onPressPlaylist,
}: PlaylistCarouselProps) {
  if (playlists.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Recommended playlists"
        subtitle="Refreshed for you this week"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_SIZE + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollRow}
      >
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onPress={
              onPressPlaylist ? () => onPressPlaylist(playlist) : undefined
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PlaylistCard({
  playlist,
  onPress,
}: {
  playlist: RecommendedPlaylist;
  onPress?: () => void;
}) {
  const { typography } = useTheme();
  const availability = availabilityFromCounts(
    playlist.tracks.filter((t) => t.inLibrary).length,
    playlist.trackCount,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playlist.name}
      onPress={onPress}
      style={styles.card}
    >
      <AlbumArt
        gradientKey={pickGradient(playlist.id)}
        artUrl={playlist.coverArtUrl}
        artUrls={mosaicArtFromTracks(playlist.tracks)}
        size={CARD_SIZE}
        radius={12}
        badge={<AvailabilityBadge state={availability} size="tile" />}
      />
      <View style={styles.overlay} pointerEvents="none">
        <Text style={[styles.source, { fontFamily: typography.fontFamily }]}>
          {sourceLabel(playlist.source).toUpperCase()}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.name, { fontFamily: typography.fontFamily }]}
        >
          {playlist.name}
        </Text>
        <Text style={[styles.count, { fontFamily: typography.fontFamily }]}>
          {playlist.trackCount} tracks
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 4,
  },
  scrollRow: {
    gap: CARD_GAP,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    experimental_backgroundImage:
      "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
  },
  source: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.6)",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginTop: 2,
  },
  count: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
});
