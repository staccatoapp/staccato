import { CloudCheck } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { AvailabilityBadge } from "@/components/ui/availability-badge";
import { pickGradient } from "@/lib/gradient";
import { type DownloadedCollection } from "@/stores/downloads-store";
import { useTheme } from "@/theme";

const CELL_GAP = 8;

interface AvailableOfflineGridProps {
  items: DownloadedCollection[];
}

function subtitleFor(item: DownloadedCollection): string {
  const noun = item.kind === "album" ? "Album" : "Playlist";
  const count = item.trackIds.length;
  return `${noun} · ${count} track${count === 1 ? "" : "s"}`;
}

/**
 * The offline Home's only surviving content block: a 2-column grid of the
 * collections pinned to the device, sourced from the downloads manifest. Cells
 * are visual-only this iteration (tap/playback comes next). Mirrors
 * `QuickStartGrid`'s cell styling. The "downloaded" badge reuses the app's
 * existing CloudCheck idiom rather than introducing a new accent color.
 */
export function AvailableOfflineGrid({ items }: AvailableOfflineGridProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const cellWidth = (width - spacing.homeScreenPadding * 2 - CELL_GAP) / 2;

  return (
    <View style={{ paddingHorizontal: spacing.homeScreenPadding }}>
      <View style={styles.header}>
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 19,
            fontWeight: "700",
            letterSpacing: -0.3,
            color: colors.fg,
          }}
        >
          Available offline
        </Text>
        <View style={styles.count}>
          <CloudCheck size={15} color={colors.fgMuted} strokeWidth={2} />
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 13,
              color: colors.fgMuted,
            }}
          >
            {items.length} item{items.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[
              styles.cell,
              {
                width: cellWidth,
                backgroundColor: colors.bgRaised,
                borderRadius: radius.quickStartCell,
                borderColor: colors.border,
              },
            ]}
          >
            <AlbumArt
              gradientKey={pickGradient(item.id)}
              artUrl={item.kind === "album" ? item.coverArtUrls[0] : undefined}
              artUrls={item.kind === "playlist" ? item.coverArtUrls : undefined}
              size={52}
              radius={radius.quickStartArt}
              glyphSize={20}
              badge={<AvailabilityBadge state="downloaded" size="tile" />}
            />
            <View style={styles.textBlock}>
              <Text
                style={[
                  styles.title,
                  { color: colors.fg, fontFamily: typography.fontFamily },
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View style={styles.subtitleRow}>
                <CloudCheck size={13} color={colors.fgMuted} strokeWidth={2} />
                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: colors.fgMuted,
                      fontFamily: typography.fontFamily,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {subtitleFor(item)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  count: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CELL_GAP,
  },
  cell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 7,
    paddingRight: 10,
    overflow: "hidden",
    borderWidth: 0.5,
  },
  textBlock: {
    flexShrink: 1,
    flexGrow: 1,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  subtitle: {
    flexShrink: 1,
    fontSize: 11.5,
  },
});
