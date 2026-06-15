import { Pause, Play } from "lucide-react-native";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PlayOff } from "@/components/icons/play-off";
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
  /** Artist name, passed to the preview proxy when previewing an external track. */
  artistName: string;
}

interface TrackRowProps {
  track: TrackRowTrack;
  /** 1-based position shown in the index column; omitted hides the column. */
  index?: number;
  /** Renders a hairline divider at the bottom (for grouped card sections). */
  divider?: boolean;
  /** Trailing slot — duration text or a Lidarr request button. */
  trailing?: ReactNode;
  /**
   * Album queue context. When provided for an owned row, tapping plays the whole
   * album starting at this track (queue = `queueTrackIds`, start = `queueIndex`)
   * instead of the single track. Explore/search callers omit these.
   */
  queueTrackIds?: string[];
  queueIndex?: number;
}

/**
 * A track row shared by Explore's recommended list and search results. The
 * artwork doubles as a play affordance: tapping an owned track plays it in full
 * via the playback session; tapping an external track streams a 30-second
 * preview through the server proxy. External rows are previewable optimistically
 * (the play overlay shows up front, with a progress bar while previewing); a
 * track whose preview turns out not to exist shows a disabled "preview off"
 * glyph. An owned track with no local id falls back to plain artwork.
 */
export function TrackRow({
  track,
  index,
  divider,
  trailing,
  queueTrackIds,
  queueIndex,
}: TrackRowProps) {
  const { colors, typography } = useTheme();
  const {
    previewingId,
    previewLoadingId,
    previewProgress,
    isPreviewUnavailable,
    togglePreview,
  } = usePreview();
  const { currentTrack, isPlaying, playTracks, togglePlay } = usePlayback();

  const { recordingMbid, localTrackId, inLibrary } = track;
  const isPreviewing = previewingId === recordingMbid;
  const isLoading = previewLoadingId === recordingMbid;
  const unavailable = !inLibrary && isPreviewUnavailable(recordingMbid);
  const isCurrent =
    inLibrary && localTrackId != null && currentTrack?.id === localTrackId;
  const isPlayingThis = isCurrent && isPlaying;

  const showAffordance = inLibrary ? localTrackId != null : true;
  const active = isPreviewing || isPlayingThis;

  const onPress = () => {
    if (inLibrary && localTrackId != null) {
      if (isCurrent) togglePlay();
      else if (
        queueTrackIds &&
        queueTrackIds.length > 0 &&
        queueIndex != null
      ) {
        // Album context: queue the whole album, starting at this track.
        playTracks(queueTrackIds, queueIndex);
      } else playTracks([localTrackId], 0);
      return;
    }
    togglePreview(recordingMbid, track.artistName, track.title);
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

      {showAffordance && unavailable ? (
        <View
          accessibilityRole="image"
          accessibilityLabel="Preview unavailable"
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
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
          >
            <PlayOff size={15} color="rgba(255,255,255,0.7)" />
          </View>
        </View>
      ) : showAffordance ? (
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
