import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Carousel, HeroRec, QuickStartGrid } from "@/components/home";
import { usePlaylists } from "@/hooks/use-playlists";
import { useRecentlyPlayed } from "@/hooks/use-recently-played";
import { useRecommendedPlaylists } from "@/hooks/use-recommended-playlists";
import {
  type HomeMix,
  type HomePlaylist,
  type HomeRecPlaylist,
} from "@/lib/home-types";
import { pickGradient } from "@/lib/gradient";
import { useContentBottomInset } from "@/lib/player-layout";
import { useTheme } from "@/theme";

function deriveArtistSummary(tracks: { artistName: string | null }[]): string {
  const names = [
    ...new Set(
      tracks.map((t) => t.artistName).filter((n): n is string => n !== null),
    ),
  ].slice(0, 3);
  if (names.length === 0) return "Various Artists";
  if (names.length === 1) return `Based on ${names[0]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const { data: playlistsData } = usePlaylists();
  const { data: recData } = useRecommendedPlaylists();
  const recentlyPlayed = useRecentlyPlayed();

  const playlists: HomePlaylist[] = (playlistsData?.items ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    trackCount: p.trackCount,
    gradientKey: pickGradient(p.id),
    artUrls: p.coverArtUrls,
  }));

  const recReady = recData?.status === "ready" ? recData.data : [];

  const mixes: HomeMix[] = recReady.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.description ?? "",
    gradientKey: pickGradient(p.id),
    artUrl: p.coverArtUrl ?? null,
  }));

  const firstRec = recReady[0];
  const recPlaylist: HomeRecPlaylist | null = firstRec
    ? {
        id: firstRec.id,
        name: firstRec.name,
        trackCount: firstRec.trackCount,
        artistSummary: deriveArtistSummary(firstRec.tracks),
        gradientKey: pickGradient(firstRec.id),
        artUrl: firstRec.coverArtUrl ?? null,
      }
    : null;

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
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
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
  },
});
