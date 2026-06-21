import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Carousel, HeroRec, QuickStartGrid } from "@/components/home";
import { OfflineHome } from "@/components/offline/offline-home";
import { type MediaTileItem } from "@/components/ui/media-tile";
import { useSession } from "@/lib/session";
import { usePlaylists } from "@/hooks/use-playlists";
import { useRecentlyPlayed } from "@/hooks/use-recently-played";
import { useRecommendedPlaylists } from "@/hooks/use-recommended-playlists";
import {
  type HomeAlbum,
  type HomePlaylist,
  type HomeRecPlaylist,
} from "@/lib/home-types";
import { pickGradient } from "@/lib/gradient";
import { mosaicArtFromTracks } from "@/lib/mosaic-art";
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
  const { connectionStatus } = useSession();
  // The whole app degrades to downloaded-only content while the server is
  // unreachable; Home swaps to its offline shell. The online body's data hooks
  // live in a separate component so they don't run (and fire paused requests)
  // while offline.
  if (connectionStatus !== "online") {
    return <OfflineHome />;
  }
  return <HomeScreenOnline />;
}

function HomeScreenOnline() {
  const { colors } = useTheme();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const { data: playlistsData } = usePlaylists();
  const { data: recData } = useRecommendedPlaylists();
  const recentlyPlayed = useRecentlyPlayed();

  const playlists: MediaTileItem[] = (playlistsData?.items ?? []).map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: `${p.trackCount} tracks`,
    gradientKey: pickGradient(p.id),
    artUrls: p.coverArtUrls,
  }));

  const recReady = recData?.status === "ready" ? recData.data : [];

  const mixes: MediaTileItem[] = recReady.map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: p.description ?? "",
    gradientKey: pickGradient(p.id),
    artUrl: p.coverArtUrl ?? null,
    artUrls: mosaicArtFromTracks(p.tracks),
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
        artUrls: mosaicArtFromTracks(firstRec.tracks),
      }
    : null;

  // Recommended playlists (hero + "Made for you") push the recommended-mode
  // playlist route; in-library playlists ("Your playlists") push the in-library
  // one. Both stack within the Home tab so the native tab bar stays visible.
  const openRecPlaylist = (id: string) => {
    router.push({
      pathname: "/(protected)/(home)/rec-playlist/[playlistKey]",
      params: { playlistKey: id },
    });
  };

  const openPlaylist = (id: string) => {
    router.push({
      pathname: "/(protected)/(home)/playlist/[playlistKey]",
      params: { playlistKey: id },
    });
  };

  // The recently-played grid now spans both albums and playlists; tapping a tile
  // opens its detail screen within the Home tab stack.
  const openRecentlyPlayed = (item: HomeAlbum | HomePlaylist) => {
    if ("title" in item) {
      router.push({
        pathname: "/(protected)/(home)/album/[albumKey]",
        params: { albumKey: item.id },
      });
    } else {
      router.push({
        pathname: "/(protected)/(home)/playlist/[playlistKey]",
        params: { playlistKey: item.id },
      });
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
    >
      {recPlaylist && (
        <HeroRec
          playlist={recPlaylist}
          onPress={() => openRecPlaylist(recPlaylist.id)}
        />
      )}
      <QuickStartGrid items={recentlyPlayed} onPress={openRecentlyPlayed} />
      <Carousel
        title="Made for you"
        items={mixes}
        onPressItem={(item) => openRecPlaylist(item.id)}
        onSeeAll={() => router.navigate("/(protected)/explore")}
      />
      <Carousel
        title="Your playlists"
        items={playlists}
        onPressItem={(item) => openPlaylist(item.id)}
        onSeeAll={() =>
          router.navigate({
            pathname: "/(protected)/library",
            params: { tab: "playlists" },
          })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
});
