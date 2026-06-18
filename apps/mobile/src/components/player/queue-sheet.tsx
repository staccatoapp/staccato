import { GripHorizontal } from "lucide-react-native";
import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { PlaybackTrack } from "@staccato/shared";

import { AlbumArt } from "@/components/home/album-art";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { pickGradient } from "@/lib/gradient";
import { formatPlayerTime } from "@/lib/playback";
import { usePlayback } from "@/providers/playback-provider";
import { useTheme } from "@/theme";
import { EqualizerBars } from "./equalizer-bars";

const SHEET_HEIGHT = 560;

interface QueueSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "Up Next" bottom sheet over the Now Playing view: drag handle, the playing
 * track with an equalizer, then the rest of the queue (tap to play; reorder
 * is a future pass — the grip is a visual affordance only).
 */
export function QueueSheet({ open, onClose }: QueueSheetProps) {
  const { colors } = useTheme();
  const { session, currentTrack, isPlaying, jumpToIndex } = usePlayback();

  if (!session || !currentTrack) return null;

  const currentIndex = session.currentTrackIndex;
  const upNext = session.trackQueue
    .map((t, index) => ({ track: t, index }))
    .slice(currentIndex + 1);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      backdropTestID="queue-sheet-backdrop"
      style={styles.sheetOverride}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Up next</Text>
      </View>

      <View style={styles.nowPlayingSection}>
        <Text style={styles.eyebrow}>NOW PLAYING</Text>
        <View style={styles.nowPlayingCard}>
          <AlbumArt
            gradientKey={pickGradient(currentTrack.id)}
            artUrl={currentTrack.coverArtUrl}
            size={44}
            radius={6}
            glyphSize={18}
          />
          <View style={styles.trackMeta}>
            <Text
              numberOfLines={1}
              style={[styles.nowPlayingTitle, { color: colors.primaryText }]}
            >
              {currentTrack.title}
            </Text>
            <Text numberOfLines={1} style={styles.cardArtist}>
              {currentTrack.artistName ?? "Unknown Artist"}
            </Text>
          </View>
          <EqualizerBars playing={isPlaying} color={colors.primaryText} />
        </View>
      </View>

      <FlatList
        data={upNext}
        keyExtractor={(item) => item.track.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          currentTrack.albumTitle ? (
            <Text style={[styles.eyebrow, styles.listEyebrow]}>
              {`FROM ${currentTrack.albumTitle.toUpperCase()}`}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <QueueRow
            track={item.track}
            onPress={() => jumpToIndex(item.index)}
          />
        )}
      />
    </BottomSheet>
  );
}

function QueueRow({
  track,
  onPress,
}: {
  track: PlaybackTrack;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title}`}
      onPress={onPress}
      style={styles.row}
    >
      <GripHorizontal size={18} color="rgba(255,255,255,0.45)" />
      <View style={styles.trackMeta}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.cardArtist}>
          {track.artistName ?? "Unknown Artist"}
        </Text>
      </View>
      <Text style={styles.duration}>
        {formatPlayerTime(track.durationSeconds ?? 0)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetOverride: {
    height: SHEET_HEIGHT,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#fff",
  },
  nowPlayingSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    marginBottom: 8,
  },
  nowPlayingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  trackMeta: {
    flex: 1,
    minWidth: 0,
  },
  nowPlayingTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardArtist: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
  },
  listEyebrow: {
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
  },
  duration: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontVariant: ["tabular-nums"],
  },
});
