import { GripHorizontal, X } from "lucide-react-native";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { PlaybackTrack } from "@staccato/shared";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { formatPlayerTime } from "@/lib/playback";
import { usePlayback } from "@/providers/playback-provider";
import { useTheme } from "@/theme";
import { EqualizerBars } from "./equalizer-bars";
import { PLAYER_EASING, SHEET_SLIDE_MS } from "./player-easing";

const SHEET_HEIGHT = 560;
/** Sheet surface: oklch(0.18 0 0) converted to sRGB. */
const SHEET_BACKGROUND = "rgb(19,19,19)";

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

  const sheetY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  useEffect(() => {
    sheetY.value = withTiming(open ? 0 : SHEET_HEIGHT, {
      duration: SHEET_SLIDE_MS,
      easing: PLAYER_EASING,
    });
    backdropOpacity.value = withTiming(open ? 1 : 0, { duration: 300 });
  }, [open, sheetY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!session || !currentTrack) return null;

  const currentIndex = session.currentTrackIndex;
  const upNext = session.trackQueue
    .map((t, index) => ({ track: t, index }))
    .slice(currentIndex + 1);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          testID="queue-sheet-backdrop"
          accessibilityLabel="Close queue"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Up next</Text>
          <Pressable
            testID="queue-sheet-close"
            accessibilityRole="button"
            accessibilityLabel="Close queue"
            onPress={onClose}
            style={styles.closeButton}
          >
            <X size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
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
      </Animated.View>
    </View>
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
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: SHEET_BACKGROUND,
    boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
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
