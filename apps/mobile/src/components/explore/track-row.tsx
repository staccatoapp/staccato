import { Pause, Play } from "lucide-react-native";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { usePlayback } from "@/providers/playback-provider";
import { usePreview } from "@/providers/preview-provider";
import { useTheme } from "@/theme";

const ART = 44;

export interface TrackRowTrack {
  recordingMbid: string;
  title: string;
  subtitle: string;
  coverArtUrl: string | null;
  inLibrary: boolean;
  /** Local DB track id when owned — enables full-track playback. */
  localTrackId: string | null;
  /** Resolves the 30s preview url (inline for recs, lazy lookup for search). */
  resolvePreviewUrl: () => Promise<string | null>;
  /**
   * Whether a preview is known to exist. Recommended tracks know up front
   * (previewUrl != null); search rows pass true and resolve lazily on tap.
   */
  previewable: boolean;
}

interface TrackRowProps {
  track: TrackRowTrack;
  /** 1-based position shown in the index column; omitted hides the column. */
  index?: number;
  /** Renders a hairline divider at the bottom (for grouped card sections). */
  divider?: boolean;
  /** Trailing slot — duration text or a Lidarr request button. */
  trailing?: ReactNode;
}

/**
 * A track row shared by Explore's recommended list and search results. The
 * artwork doubles as a play affordance: tapping an owned track plays it in full
 * via the playback session; tapping an external track plays a 30-second
 * preview. Owned/previewable rows show a play overlay (and a progress bar while
 * previewing); rows with neither show plain, non-interactive artwork.
 */
export function TrackRow({ track, index, divider, trailing }: TrackRowProps) {
  const { colors, typography } = useTheme();
  const { previewingId, previewLoadingId, previewProgress, togglePreview } =
    usePreview();
  const { currentTrack, isPlaying, playTracks, togglePlay } = usePlayback();

  const { recordingMbid, localTrackId, inLibrary } = track;
  const isPreviewing = previewingId === recordingMbid;
  const isLoading = previewLoadingId === recordingMbid;
  const isCurrent =
    inLibrary && localTrackId != null && currentTrack?.id === localTrackId;
  const isPlayingThis = isCurrent && isPlaying;

  const showAffordance = inLibrary ? localTrackId != null : track.previewable;
  const active = isPreviewing || isPlayingThis;

  const onPress = () => {
    if (inLibrary && localTrackId != null) {
      if (isCurrent) togglePlay();
      else playTracks([localTrackId], 0);
      return;
    }
    togglePreview(recordingMbid, track.resolvePreviewUrl);
  };

  return (
    <View style={styles.row}>
      {index !== undefined ? (
        <Text
          style={[
            styles.index,
            { color: colors.fgSubtle, fontFamily: typography.fontFamily },
          ]}
        >
          {index}
        </Text>
      ) : null}

      {showAffordance ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? "Stop" : "Play"}
          onPress={onPress}
          style={styles.art}
        >
          <AlbumArt
            gradientKey={pickGradient(recordingMbid)}
            artUrl={track.coverArtUrl}
            size={ART}
            radius={6}
            glyphSize={18}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.artOverlay,
              {
                backgroundColor: active
                  ? "rgba(0,0,0,0.55)"
                  : "rgba(0,0,0,0.32)",
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : active ? (
              <Pause size={15} color="#fff" fill="#fff" />
            ) : (
              <Play
                size={15}
                color="#fff"
                fill="#fff"
                style={styles.playGlyph}
              />
            )}
          </View>
        </Pressable>
      ) : (
        <View style={styles.art}>
          <AlbumArt
            gradientKey={pickGradient(recordingMbid)}
            artUrl={track.coverArtUrl}
            size={ART}
            radius={6}
            glyphSize={18}
          />
        </View>
      )}

      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: active ? colors.primaryText : colors.fg,
              fontFamily: typography.fontFamily,
            },
          ]}
        >
          {track.title}
        </Text>
        {track.subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              styles.subtitle,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            {track.subtitle}
          </Text>
        ) : null}
        {isPreviewing ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primaryText,
                  width: `${Math.round(previewProgress * 100)}%`,
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      {trailing}
      {divider ? (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  index: {
    width: 18,
    textAlign: "center",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  art: {
    width: ART,
    height: ART,
    borderRadius: 6,
    overflow: "hidden",
  },
  artOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  playGlyph: {
    marginLeft: -2,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  progressTrack: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  divider: {
    position: "absolute",
    left: 64,
    right: 0,
    bottom: 0,
    height: 0.5,
  },
});
