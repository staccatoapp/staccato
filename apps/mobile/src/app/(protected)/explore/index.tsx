import { router } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useLidarrSheet } from "@/providers/lidarr-sheet-provider";
import { PlaylistCarousel } from "@/components/explore/playlist-carousel";
import { RecTrackRow } from "@/components/explore/rec-track-row";
import { SearchResultsView } from "@/components/explore/search-results-view";
import { SectionHeader } from "@/components/explore/section-header";
import { SearchField } from "@/components/ui/search-field";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useExternalSearch } from "@/hooks/use-external-search";
import { useRecommendedPlaylists } from "@/hooks/use-recommended-playlists";
import { useRecommendedTracks } from "@/hooks/use-recommended-tracks";
import { useContentBottomInset } from "@/lib/player-layout";
import { useTheme } from "@/theme";

export default function ExploreScreen() {
  const { colors, typography } = useTheme();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const [query, setQuery] = useState("");
  const lidarrSheet = useLidarrSheet();

  const active = query.trim().length > 0;
  const debounced = useDebouncedValue(query.trim(), 300);
  const search = useExternalSearch(active ? debounced : "");

  const playlistsResp = useRecommendedPlaylists();
  const tracksResp = useRecommendedTracks();
  const playlists =
    playlistsResp.data?.status === "ready" ? playlistsResp.data.data : [];
  const tracks =
    tracksResp.data?.status === "ready" ? tracksResp.data.data : [];
  const recsWarming =
    playlistsResp.data?.status === "warming" ||
    tracksResp.data?.status === "warming";

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      >
        <View style={styles.searchWrap}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Artists, albums, or tracks"
            testID="explore-search"
          />
        </View>

        {active ? (
          <SearchSection isLoading={search.isLoading} hasData={!!search.data}>
            {search.data ? (
              <SearchResultsView
                results={search.data}
                onRequestDownload={lidarrSheet.open}
              />
            ) : null}
          </SearchSection>
        ) : (
          <View>
            <PlaylistCarousel
              playlists={playlists}
              onPressPlaylist={(playlist) =>
                router.push({
                  pathname: "/(protected)/explore/playlist/[playlistKey]",
                  params: { playlistKey: playlist.id },
                })
              }
            />

            <View style={styles.tracksSection}>
              <SectionHeader
                title="Recommended tracks"
                subtitle="Picked from your listening · 30-second previews"
              />
              {tracks.map((track, i) => (
                <RecTrackRow
                  key={track.recordingMbid}
                  track={track}
                  index={i + 1}
                  onRequestDownload={lidarrSheet.open}
                />
              ))}
              {tracks.length === 0 && recsWarming ? (
                <View style={styles.loading}>
                  <Spinner size={20} color={colors.fgMuted} />
                </View>
              ) : null}
              {tracks.length === 0 && !recsWarming ? (
                <Text
                  style={[
                    styles.placeholder,
                    {
                      color: colors.fgMuted,
                      fontFamily: typography.fontFamily,
                    },
                  ]}
                >
                  No recommendations yet — listen to a few tracks to seed them.
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

    </View>
  );
}

function SearchSection({
  isLoading,
  hasData,
  children,
}: {
  isLoading: boolean;
  hasData: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (isLoading && !hasData) {
    return (
      <View style={styles.loading}>
        <Spinner size={20} color={colors.fgMuted} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tracksSection: {
    marginTop: 24,
  },
  loading: {
    paddingVertical: 48,
    alignItems: "center",
  },
  placeholder: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    fontSize: 14,
  },
});
