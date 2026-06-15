import { Download, Info, Radio } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AlbumArt } from "@/components/home/album-art";
import {
  PLAYER_EASING,
  SHEET_SLIDE_MS,
} from "@/components/player/player-easing";
import { pickGradient } from "@/lib/gradient";
import { type PlaylistView } from "@/lib/playlist-view-model";
import { useTheme } from "@/theme";

const OFFSCREEN = 700;

interface AddAllSheetProps {
  open: boolean;
  view: PlaylistView;
  onClose: () => void;
}

/**
 * "Add all to library" bottom sheet for a recommended playlist. Presentational
 * only (a visual stub): saving a recommended playlist + bulk-requesting its
 * missing tracks has no server endpoint yet, so the confirm button just
 * dismisses. The quality-profile and keep-in-sync controls are local UI state.
 */
export function AddAllSheet({ open, view, onClose }: AddAllSheetProps) {
  const { colors, typography } = useTheme();
  const [quality, setQuality] = useState<"lossless" | "standard">("lossless");
  const [monitored, setMonitored] = useState(true);
  const missing = Math.max(0, view.total - view.localCount);

  const sheetY = useSharedValue(OFFSCREEN);
  const backdropOpacity = useSharedValue(0);
  useEffect(() => {
    sheetY.value = withTiming(open ? 0 : OFFSCREEN, {
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

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          testID="add-all-sheet-backdrop"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </Animated.View>

      <Animated.View
        testID="add-all-sheet"
        style={[styles.sheet, { backgroundColor: colors.bgRaised }, sheetStyle]}
      >
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* playlist row */}
        <View style={styles.header}>
          <AlbumArt
            gradientKey={pickGradient(view.id)}
            artUrl={view.coverArtUrl}
            artUrls={view.coverArtUrls.length ? view.coverArtUrls : undefined}
            size={58}
            radius={8}
          />
          <View style={styles.headerText}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                { color: colors.fg, fontFamily: typography.fontFamily },
              ]}
            >
              {view.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.subtitle,
                { color: colors.fgMuted, fontFamily: typography.fontFamily },
              ]}
            >
              {view.total} songs
              {view.source ? ` · ${view.source}` : ""}
            </Text>
          </View>
        </View>

        {/* what happens */}
        <View style={[styles.notice, { backgroundColor: colors.bgMuted }]}>
          <Info size={18} color={colors.primaryText} strokeWidth={2} />
          <Text
            style={[
              styles.noticeText,
              { color: colors.fg, fontFamily: typography.fontFamily },
            ]}
          >
            {view.localCount} of {view.total} tracks are already in your
            library.{" "}
            <Text style={{ color: colors.primaryText, fontWeight: "600" }}>
              {missing} will be requested via Lidarr
            </Text>{" "}
            and downloaded to your library.
          </Text>
        </View>

        {/* quality profile */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.fgSubtle, fontFamily: typography.fontFamily },
          ]}
        >
          QUALITY PROFILE
        </Text>
        <View style={styles.qualityRow}>
          {(
            [
              ["lossless", "Lossless", "FLAC / ALAC"],
              ["standard", "Standard", "MP3 320"],
            ] as const
          ).map(([value, label, sub]) => {
            const on = quality === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => setQuality(value)}
                style={[
                  styles.qualityCard,
                  {
                    backgroundColor: on ? colors.primaryBg : colors.bgMuted,
                    borderColor: on ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.qualityTitle,
                    {
                      color: on ? colors.primaryText : colors.fg,
                      fontFamily: typography.fontFamily,
                    },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.qualitySub,
                    {
                      color: colors.fgMuted,
                      fontFamily: typography.fontFamily,
                    },
                  ]}
                >
                  {sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* keep in sync */}
        <View style={[styles.syncRow, { backgroundColor: colors.bgMuted }]}>
          <Radio size={18} color={colors.fgMuted} strokeWidth={2} />
          <View style={styles.syncText}>
            <Text
              style={[
                styles.syncTitle,
                { color: colors.fg, fontFamily: typography.fontFamily },
              ]}
            >
              Keep playlist in sync
            </Text>
            <Text
              style={[
                styles.syncSub,
                { color: colors.fgSubtle, fontFamily: typography.fontFamily },
              ]}
            >
              Auto-grab tracks added by the curator
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Keep playlist in sync"
            accessibilityState={{ checked: monitored }}
            onPress={() => setMonitored((m) => !m)}
            style={[
              styles.toggle,
              { backgroundColor: monitored ? colors.primary : colors.bgSubtle },
            ]}
          >
            <View style={[styles.knob, { left: monitored ? 21 : 3 }]} />
          </Pressable>
        </View>

        <Pressable
          testID="add-all-confirm"
          accessibilityRole="button"
          accessibilityLabel="Add all to library"
          onPress={onClose}
          style={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <Download size={19} color="#fff" strokeWidth={2.2} />
          <Text style={[styles.ctaText, { fontFamily: typography.fontFamily }]}>
            Add all to library
          </Text>
        </Pressable>
      </Animated.View>
    </View>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 30,
    boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
  },
  handleWrap: {
    alignItems: "center",
    marginBottom: 18,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 13,
    borderRadius: 12,
    marginBottom: 18,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  qualityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  qualityCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  qualityTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  qualitySub: {
    fontSize: 12,
    marginTop: 2,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  syncText: {
    flex: 1,
    minWidth: 0,
  },
  syncTitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  syncSub: {
    fontSize: 11,
    marginTop: 1,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 16,
    justifyContent: "center",
  },
  knob: {
    position: "absolute",
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
