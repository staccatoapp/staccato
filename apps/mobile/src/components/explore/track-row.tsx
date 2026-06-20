import { EllipsisVertical } from "lucide-react-native";
import type { PlaybackSource } from "@staccato/shared";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PlayOff } from "@/components/icons/play-off";
import { AlbumArt } from "@/components/home/album-art";
import { EqualizerBars } from "@/components/player/equalizer-bars";
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
   * Album-tracklist styling: hides the artwork (the album hero already shows it)
   * and appends a 3-dot "more options" button after `trailing`.
   */
  album?: boolean;
  /**
   * Album queue context. When provided for an owned row, tapping plays the whole
   * album starting at this track (queue = `queueTrackIds`, start = `queueIndex`)
   * instead of the single track. Explore/search callers omit these.
   */
  queueTrackIds?: string[];
  queueIndex?: number;
  /**
   * Origin of the queue (album / in-library playlist), recorded with the listen
   * for recently-played. Only meaningful alongside `queueTrackIds`.
   */
  source?: PlaybackSource;
}

/**
 * A track row shared by Explore, search, album, and playlist screens. The whole
 * row is the play affordance: tapping an owned track plays it in full via the
 * playback session; tapping an external track streams a 30-second preview through
 * the server proxy. The currently-sounding track (full playback or preview) is
 * marked by a subtle equalizer-bars indicator before its title — the same motif
 * as the splash logo — rather than a play/pause overlay on the artwork. A track
 * whose preview turns out not to exist shows a disabled "preview off" glyph and
 * isn't tappable. In `album` context the artwork is hidden and a 3-dot more
 * button trails the row.
 */
export function TrackRow({
  track,
  index,
  divider,
  trailing,
  album,
  queueTrackIds,
  queueIndex,
  source,
}: TrackRowProps) {
  const { colors, typography } = useTheme();
  const { previewingId, previewProgress, isPreviewUnavailable, togglePreview } =
    usePreview();
  const { currentTrack, isPlaying, playTracks, togglePlay } = usePlayback();

  const { recordingMbid, localTrackId, inLibrary } = track;
  const isPreviewing = previewingId === recordingMbid;
  const unavailable = !inLibrary && isPreviewUnavailable(recordingMbid);
  const isCurrent =
    inLibrary && localTrackId != null && currentTrack?.id === localTrackId;
  const isPlayingThis = isCurrent && isPlaying;

  // Owned tracks need a local id to play; external tracks are always previewable.
  const hasAffordance = inLibrary ? localTrackId != null : true;
  const canPress = hasAffordance && !unavailable;

  // `showEq` marks the row as the active track (current owned track — even paused
  // — or the one being previewed); `eqPlaying` drives the bar animation, frozen
  // when the current track is paused.
  const showEq = isCurrent || isPreviewing;
  const eqPlaying = isPlayingThis || isPreviewing;
  // The press label flips to "Stop" only while audio is actually sounding.
  const pressLabel = canPress ? (eqPlaying ? "Stop" : "Play") : undefined;

  const onPress = () => {
    if (inLibrary && localTrackId != null) {
      if (isCurrent) togglePlay();
      else if (
        queueTrackIds &&
        queueTrackIds.length > 0 &&
        queueIndex != null
      ) {
        // Album/playlist context: queue the whole list, starting at this track.
        playTracks(queueTrackIds, queueIndex, source);
      } else playTracks([localTrackId], 0);
      return;
    }
    togglePreview(recordingMbid, track.artistName, track.title);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={canPress ? "button" : undefined}
        accessibilityLabel={pressLabel}
        onPress={onPress}
        disabled={!canPress}
        style={styles.main}
      >
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

        {album ? null : unavailable ? (
          <View
            testID="track-art"
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
        ) : (
          <View testID="track-art" style={styles.art}>
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
          <View style={styles.titleRow}>
            {showEq ? (
              <EqualizerBars playing={eqPlaying} color={colors.primaryText} />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                {
                  color: showEq ? colors.primaryText : colors.fg,
                  fontFamily: typography.fontFamily,
                },
              ]}
            >
              {track.title}
            </Text>
          </View>
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
      </Pressable>

      {trailing}
      {album ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={6}
          // TODO: open the per-track context menu (non-functional for now).
          onPress={() => {}}
          style={styles.more}
        >
          <EllipsisVertical size={18} color={colors.fgMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
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
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
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
  text: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
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
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    position: "absolute",
    left: 64,
    right: 0,
    bottom: 0,
    height: 0.5,
  },
});
