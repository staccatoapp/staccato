import {
  Cloud,
  CloudCheck,
  CloudDownload,
  CloudOff,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import type { AvailabilityState } from "@/lib/availability";
import { useTheme } from "@/theme";

/**
 * Per-state icon, accessible label, and tint. `CloudCheck` reuses the success
 * tint to match the `DownloadButton`'s downloaded affordance; the rest are
 * white so they read over any artwork.
 */
const META: Record<
  AvailabilityState,
  { Icon: LucideIcon; label: string; tinted: boolean }
> = {
  downloaded: { Icon: CloudCheck, label: "Downloaded to device", tinted: true },
  inLibrary: { Icon: Cloud, label: "In your library", tinted: false },
  partial: {
    Icon: CloudDownload,
    label: "Partially in your library",
    tinted: false,
  },
  recommended: { Icon: CloudOff, label: "Not in your library", tinted: false },
};

const SIZES = {
  tile: { box: 22, icon: 13 },
  hero: { box: 30, icon: 18 },
} as const;

interface AvailabilityBadgeProps {
  state: AvailabilityState;
  /** Smaller pill for grid/carousel tiles; larger for detail heroes. */
  size?: keyof typeof SIZES;
}

/**
 * Icon-only availability pill overlaid bottom-right on album/playlist artwork —
 * the single, consistent indicator of whether a collection is downloaded, in
 * library, partly in library, or merely recommended. Presentational: the state
 * is derived upstream (see {@link useResolvedAvailability}).
 */
export function AvailabilityBadge({
  state,
  size = "tile",
}: AvailabilityBadgeProps) {
  const { colors } = useTheme();
  const { Icon, label, tinted } = META[state];
  const { box, icon } = SIZES[size];

  return (
    <View
      testID="availability-badge"
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.pill, { width: box, height: box, borderRadius: box / 2 }]}
    >
      <Icon
        size={icon}
        color={tinted ? colors.successText : "#fff"}
        strokeWidth={2.2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
});
