import { CloudCheck, Download } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import type { DownloadableCollection } from "@/lib/downloadable";
import { useSession } from "@/lib/session";
import {
  useCollectionStatus,
  useDownloadsStore,
} from "@/stores/downloads-store";
import { useTheme } from "@/theme";

import { DownloadRing } from "./download-ring";

interface DownloadButtonProps {
  collection: DownloadableCollection;
}

/**
 * The offline-download affordance for a playlist or album hero. A single ghost
 * circle that cycles idle → downloading (determinate ring) → downloaded (check).
 * Reused across the playlist and album heroes; the collection descriptor is the
 * only input, so adding it to a new screen is one line. Removing a download is
 * deferred, so the downloaded state is non-interactive; a partial download
 * (some tracks failed) stays tappable to retry the rest.
 */
export function DownloadButton({ collection }: DownloadButtonProps) {
  const { colors } = useTheme();
  const { session } = useSession();
  const status = useCollectionStatus(collection.id);
  const download = useDownloadsStore((s) => s.download);

  const pending = status.state === "idle" || status.state === "partial";

  const onPress = () => {
    if (session && pending) void download(collection, session);
  };

  const label =
    status.state === "downloaded"
      ? "Downloaded"
      : status.state === "downloading"
        ? "Downloading"
        : "Download for offline play";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !pending }}
      disabled={!pending}
      onPress={onPress}
      style={styles.ghostCircle}
    >
      {status.state === "downloading" ? (
        <DownloadRing
          progress={status.total > 0 ? status.completed / status.total : 0}
        />
      ) : status.state === "downloaded" ? (
        <CloudCheck size={20} color={colors.successText} strokeWidth={2} />
      ) : (
        <Download size={20} color="#fff" strokeWidth={2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ghostCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
