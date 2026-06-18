import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { AlbumDetail } from "@/components/album/album-detail";
import { subjectFromAlbumDetail } from "@/components/explore/add-album-sheet";
import { useLidarrSheet } from "@/providers/lidarr-sheet-provider";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";
import { useAlbumDetail } from "@/hooks/use-album-detail";
import { useTheme } from "@/theme";

/**
 * The album-route pathnames. The screen is hosted inside each tab's own Stack
 * (so the native tab bar stays visible), so a "More by artist" tap must push
 * the sibling album onto the *same* tab stack — the host passes its own path.
 */
export type AlbumBasePath =
  | "/(protected)/explore/album/[albumKey]"
  | "/(protected)/library/album/[albumKey]"
  | "/(protected)/(home)/album/[albumKey]";

/**
 * Album detail screen, shared by owned albums (opened by local id) and
 * explore-search albums (opened by release-group MBID). Rendered by a thin
 * per-tab route so it stacks within the tab and keeps the tab bar visible.
 */
export function AlbumScreen({ basePath }: { basePath: AlbumBasePath }) {
  const { colors, typography } = useTheme();
  const { albumKey } = useLocalSearchParams<{ albumKey: string }>();
  const { data: detail, isLoading, isError } = useAlbumDetail(albumKey);
  const lidarrSheet = useLidarrSheet();

  return (
    <Screen scroll={false}>
      {isLoading ? (
        <View style={styles.centre}>
          <Spinner size={22} color={colors.fgMuted} />
        </View>
      ) : isError || !detail ? (
        <View style={styles.centre}>
          <Text
            style={[
              styles.message,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            Couldn&apos;t load this album.
          </Text>
        </View>
      ) : (
        <AlbumDetail
          detail={detail}
          albumKey={albumKey}
          onBack={() => router.back()}
          onOpenAlbum={(key) =>
            router.push({ pathname: basePath, params: { albumKey: key } })
          }
          onRequest={() => {
            const s = subjectFromAlbumDetail(detail);
            if (s) lidarrSheet.open(s);
          }}
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
