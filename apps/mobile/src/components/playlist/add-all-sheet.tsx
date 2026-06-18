import React, { useState } from "react";
import { Text } from "react-native";

import { LidarrSheet } from "@/components/explore/lidarr-sheet";
import { pickGradient } from "@/lib/gradient";
import { type PlaylistView } from "@/lib/playlist-view-model";
import { useTheme } from "@/theme";

interface AddAllSheetProps {
  /** Non-null opens the sheet for that playlist; null closes it. */
  view: PlaylistView | null;
  onClose: () => void;
}

/**
 * "Add all to library" bottom sheet for a recommended playlist. Provided
 * globally via AddAllSheetProvider so it renders above all other overlays.
 * The CTA is a visual stub — no bulk-request endpoint exists yet.
 */
export function AddAllSheet({ view, onClose }: AddAllSheetProps) {
  const { colors } = useTheme();

  // Retain the last view so content stays visible through the close animation.
  const [shown, setShown] = useState<PlaylistView | null>(view);
  const [seen, setSeen] = useState<PlaylistView | null>(view);
  if (view !== seen) {
    setSeen(view);
    if (view) setShown(view);
  }

  const open = view != null;
  if (!shown) return null;

  const missing = Math.max(0, shown.total - shown.localCount);
  const subtitle = `${shown.total} songs${shown.source ? ` · ${shown.source}` : ""}`;

  const infoText = (
    <>
      {shown.localCount} of {shown.total} tracks are already in your library.{" "}
      <Text style={{ color: colors.primaryText, fontWeight: "600" }}>
        {missing} will be requested via Lidarr
      </Text>{" "}
      and downloaded to your library.
    </>
  );

  return (
    <LidarrSheet
      open={open}
      onClose={onClose}
      testID="add-all-sheet"
      backdropTestID="add-all-sheet-backdrop"
      header={{
        artUrl: shown.coverArtUrl,
        artUrls: shown.coverArtUrls.length ? shown.coverArtUrls : undefined,
        gradientKey: pickGradient(shown.id),
        title: shown.name,
        subtitle,
      }}
      info={{
        text: infoText,
        variant: "muted",
      }}
      cta={{
        label: "Add all to library",
        onPress: onClose,
        testID: "add-all-confirm",
      }}
    />
  );
}
