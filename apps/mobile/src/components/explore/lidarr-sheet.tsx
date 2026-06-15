import type {
  ExternalReleaseResult,
  RecommendedTrack,
  UnifiedAlbumDetail,
} from "@staccato/shared";
import { Info } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import { ApiError } from "@/lib/api-client";
import { pickGradient } from "@/lib/gradient";
import { useRequestDownload } from "@/hooks/use-request-download";
import { useTheme } from "@/theme";

/**
 * Everything the Lidarr request needs, normalised so both a recommended track
 * and a search-result album can open the same sheet. A subject only exists when
 * the release-group and artist MBIDs are both present (the request is
 * album-level), so callers build it through the helpers below and skip the
 * affordance when they return null.
 */
export interface LidarrSubject {
  releaseGroupMbid: string;
  artistMbid: string;
  artistName: string;
  albumTitle: string | null;
  coverArtUrl: string | null;
  /** Display title — the track title, or the album title for a release. */
  title: string;
}

/** Build a subject from a recommended track, or null if it can't be requested. */
export function subjectFromTrack(
  track: RecommendedTrack,
): LidarrSubject | null {
  if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName) {
    return null;
  }
  return {
    releaseGroupMbid: track.releaseGroupMbid,
    artistMbid: track.artistMbid,
    artistName: track.artistName,
    albumTitle: track.albumTitle,
    coverArtUrl: track.coverArtUrl,
    title: track.title,
  };
}

/** Build a subject from a search-result release, or null if not requestable. */
export function subjectFromRelease(
  release: ExternalReleaseResult,
): LidarrSubject | null {
  if (!release.releaseGroupMbid || !release.artistMbid) return null;
  return {
    releaseGroupMbid: release.releaseGroupMbid,
    artistMbid: release.artistMbid,
    artistName: release.artistName,
    albumTitle: release.title,
    coverArtUrl: release.coverArtUrl,
    title: release.title,
  };
}

/**
 * Build a subject from an album-detail payload, or null if not requestable.
 * Only external (MusicBrainz-only) albums carry the `artistMbid` the request
 * needs — local albums omit it, so they return null.
 */
export function subjectFromAlbumDetail(
  detail: UnifiedAlbumDetail,
): LidarrSubject | null {
  if (detail.source !== "external") return null;
  const { releaseGroupMbid, artistMbid, artistName, title, coverArtUrl } =
    detail.album;
  if (!releaseGroupMbid || !artistMbid) return null;
  return {
    releaseGroupMbid,
    artistMbid,
    artistName,
    albumTitle: title,
    coverArtUrl,
    title,
  };
}

const OFFSCREEN = 600;

interface LidarrSheetProps {
  /** Non-null opens the sheet for that subject; null closes it. */
  subject: LidarrSubject | null;
  onClose: () => void;
}

/**
 * Bottom sheet that queues a Lidarr download request for an album. Mirrors the
 * queue-sheet presentation (backdrop + slide-up). No quality-profile picker —
 * the request omits it and the server uses its configured default.
 */
export function LidarrSheet({ subject, onClose }: LidarrSheetProps) {
  const { colors, typography } = useTheme();
  const request = useRequestDownload();
  const [errored, setErrored] = useState(false);

  // Retain the last subject so its content stays rendered through the close
  // animation (the prop goes null the instant the sheet starts dismissing).
  // Uses React's "adjust state on prop change" pattern (render-phase setState,
  // guarded), so a new subject also clears any stale error.
  const [shown, setShown] = useState<LidarrSubject | null>(subject);
  const [seen, setSeen] = useState<LidarrSubject | null>(subject);
  if (subject !== seen) {
    setSeen(subject);
    if (subject) {
      setShown(subject);
      setErrored(false);
    }
  }

  const open = subject != null;
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

  if (!shown) return null;

  const subtitle = [shown.artistName, shown.albumTitle]
    .filter(Boolean)
    .join(" · ");

  const submit = () => {
    request.mutate(
      {
        releaseGroupMbid: shown.releaseGroupMbid,
        artistMbid: shown.artistMbid,
        artistName: shown.artistName,
        albumTitle: shown.albumTitle,
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          // 409 = a request for this album is already active; that's a benign
          // "already requested" outcome, so close rather than show an error.
          if (err instanceof ApiError && err.status === 409) {
            onClose();
            return;
          }
          setErrored(true);
        },
      },
    );
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          testID="lidarr-sheet-backdrop"
          accessibilityLabel="Dismiss request sheet"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </Animated.View>

      <Animated.View
        testID="lidarr-sheet"
        style={[styles.sheet, { backgroundColor: colors.bgRaised }, sheetStyle]}
      >
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <AlbumArt
            gradientKey={pickGradient(shown.releaseGroupMbid)}
            artUrl={shown.coverArtUrl}
            size={56}
            radius={8}
            glyphSize={22}
          />
          <View style={styles.headerText}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                { color: colors.fg, fontFamily: typography.fontFamily },
              ]}
            >
              {shown.title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.subtitle,
                { color: colors.fgMuted, fontFamily: typography.fontFamily },
              ]}
            >
              {subtitle}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.primaryBg,
              borderColor: "rgba(253, 121, 51, 0.35)",
            },
          ]}
        >
          <Info size={16} color={colors.primaryText} strokeWidth={2} />
          <Text
            style={[
              styles.bannerText,
              { color: colors.fg, fontFamily: typography.fontFamily },
            ]}
          >
            Additional tracks will be downloaded along with your request.
          </Text>
        </View>

        {errored ? (
          <Text
            style={[
              styles.error,
              { color: colors.destructive, fontFamily: typography.fontFamily },
            ]}
          >
            Couldn&apos;t send the request. Please try again.
          </Text>
        ) : null}

        <Pressable
          testID="lidarr-sheet-request"
          accessibilityRole="button"
          accessibilityLabel="Request via Lidarr"
          disabled={request.isPending}
          onPress={submit}
          style={[
            styles.cta,
            {
              backgroundColor: colors.primary,
              opacity: request.isPending ? 0.7 : 1,
            },
          ]}
        >
          {request.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[styles.ctaText, { fontFamily: typography.fontFamily }]}
            >
              Request via Lidarr
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          style={styles.cancel}
        >
          <Text
            style={[
              styles.cancelText,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            Cancel
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 28,
    boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
  },
  handleWrap: {
    alignItems: "center",
    marginBottom: 14,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
  },
  cta: {
    height: 52,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  cancel: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
