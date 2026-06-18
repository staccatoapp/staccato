import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useLidarrSheet } from "@/providers/lidarr-sheet-provider";
import { useAddAllSheet } from "@/providers/add-all-sheet-provider";
import { PlaylistDetail } from "@/components/playlist/playlist-detail";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";
import { usePlaylistDetail } from "@/hooks/use-playlist-detail";
import { useRecommendedPlaylist } from "@/hooks/use-recommended-playlist";
import {
  playlistViewFromLibrary,
  playlistViewFromRecommended,
  type PlaylistView,
} from "@/lib/playlist-view-model";
import { useTheme } from "@/theme";

/**
 * Which data source a playlist route reads from. A recommended playlist (opened
 * from Explore) is selected out of the cached recommendations list; an
 * in-library playlist (opened from Library / in-library search) is fetched by id.
 */
export type PlaylistMode = "recommended" | "inLibrary";

/**
 * Playlist detail screen, shared by recommended playlists (Explore) and owned
 * playlists (Library). Rendered by a thin per-tab route so it stacks within the
 * tab and keeps the native tab bar visible. The two inner components each call a
 * single data hook (so hook order stays stable) and hand a built view to the
 * shared body.
 */
export function PlaylistScreen({ mode }: { mode: PlaylistMode }) {
  const { playlistKey } = useLocalSearchParams<{ playlistKey: string }>();
  return mode === "recommended" ? (
    <RecommendedPlaylistScreen playlistKey={playlistKey ?? ""} />
  ) : (
    <LibraryPlaylistScreen playlistKey={playlistKey ?? ""} />
  );
}

function RecommendedPlaylistScreen({ playlistKey }: { playlistKey: string }) {
  const { playlist, isLoading, isError } = useRecommendedPlaylist(playlistKey);
  const view = useMemo(
    () => (playlist ? playlistViewFromRecommended(playlist) : undefined),
    [playlist],
  );
  return <PlaylistBody view={view} isLoading={isLoading} isError={isError} />;
}

function LibraryPlaylistScreen({ playlistKey }: { playlistKey: string }) {
  const { data, isLoading, isError } = usePlaylistDetail(playlistKey);
  const view = useMemo(
    () => (data ? playlistViewFromLibrary(data) : undefined),
    [data],
  );
  return <PlaylistBody view={view} isLoading={isLoading} isError={isError} />;
}

function PlaylistBody({
  view,
  isLoading,
  isError,
}: {
  view: PlaylistView | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { colors, typography } = useTheme();
  const lidarrSheet = useLidarrSheet();
  const addAllSheet = useAddAllSheet();

  return (
    <Screen scroll={false}>
      {isLoading ? (
        <View style={styles.centre}>
          <Spinner size={22} color={colors.fgMuted} />
        </View>
      ) : isError || !view ? (
        <View style={styles.centre}>
          <Text
            style={[
              styles.message,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            Couldn&apos;t load this playlist.
          </Text>
        </View>
      ) : (
        <PlaylistDetail
          view={view}
          onBack={() => router.back()}
          onRequestTrack={lidarrSheet.open}
          onAddAll={() => addAllSheet.open(view)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  message: {
    fontSize: 14,
  },
});
