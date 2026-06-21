import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { AvailableOfflineGrid } from "@/components/offline/available-offline-grid";
import { OfflineIndicator } from "@/components/offline/offline-indicator";
import { useContentBottomInset } from "@/lib/player-layout";
import { useSession } from "@/lib/session";
import { useDownloadedCollections } from "@/stores/downloads-store";
import { useTheme } from "@/theme";

/**
 * The Home screen while the server is unreachable. Every online section is
 * stripped to the one thing that works with no connection: the grid of
 * downloaded collections. A connection banner sits on top; the bottom app bar
 * and (if a downloaded track is playing) the mini player persist via the root
 * overlay. Rendered by the Home route when `connectionStatus !== "online"`.
 */
export function OfflineHome() {
  const { colors } = useTheme();
  const { connectionStatus, retryConnection } = useSession();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: true });
  const items = useDownloadedCollections();

  const status =
    connectionStatus === "reconnecting" ? "reconnecting" : "offline";

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
    >
      <OfflineIndicator status={status} onRetry={retryConnection} />
      <AvailableOfflineGrid items={items} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
});
