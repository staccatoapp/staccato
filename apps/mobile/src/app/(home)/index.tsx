import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Carousel, HeroRec, QuickStartGrid } from "@/components/home";
import { useHomeData } from "@/hooks/use-home-data";
import { useTheme } from "@/theme";

/**
 * Editorial Home: hero recommendation (when one exists), quick-start grid,
 * then the Recently played / Made for you / Your playlists carousels.
 * Playback and detail navigation don't exist yet, so taps are not wired.
 */
export default function HomeScreen() {
  const { colors } = useTheme();
  const { recPlaylist, recentlyPlayed, mixes, playlists } = useHomeData();

  const quickStartItems = [
    playlists[0],
    recentlyPlayed[0],
    playlists[1],
    recentlyPlayed[1],
    playlists[2],
    recentlyPlayed[2],
  ].filter((item) => item !== undefined);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {recPlaylist && <HeroRec playlist={recPlaylist} />}
      <QuickStartGrid items={quickStartItems} />
      <Carousel title="Recently played" items={recentlyPlayed} />
      <Carousel title="Made for you" items={mixes} />
      <Carousel title="Your playlists" items={playlists} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 24,
  },
});
