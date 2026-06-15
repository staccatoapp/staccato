import type { RecommendedTrack } from "@staccato/shared";
import { CloudDownload, Pause, Play } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { formatPlayerTime } from "@/lib/playback";
import { usePreview } from "@/providers/preview-provider";
import { useTheme } from "@/theme";

import { subjectFromTrack, type LidarrSubject } from "./lidarr-sheet";

const ART = 44;

interface RecTrackRowProps {
  track: RecommendedTrack;
  /** 1-based position shown in the index column; omitted hides the column. */
  index?: number;
  /** Opens the Lidarr sheet for a non-library, requestable track. */
  onRequestDownload: (subject: LidarrSubject) => void;
}

/**
 * A recommended-track row: index, artwork that doubles as a 30s-preview
 * play/stop button, title + subtitle (with a progress bar while previewing),
 * and a trailing duration (in library) or Lidarr request button (not in
 * library, when the album can be requested).
 */
export function RecTrackRow({
  track,
  index,
  onRequestDownload,
}: RecTrackRowProps) {
  const { colors, typography } = useTheme();
  const { previewingId, previewProgress, togglePreview } = usePreview();

  const isPreviewing = previewingId === track.recordingMbid;
  const subject = track.inLibrary ? null : subjectFromTrack(track);

  const subtitle = track.inLibrary
    ? [track.artistName, track.albumTitle].filter(Boolean).join(" · ")
    : `${track.artistName ?? "Unknown Artist"} · Not in library`;

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPreviewing ? "Stop preview" : "Play preview"}
        onPress={() => togglePreview(track.recordingMbid, track.previewUrl)}
        style={styles.art}
      >
        <AlbumArt
          gradientKey={pickGradient(track.recordingMbid)}
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
              backgroundColor: isPreviewing
                ? "rgba(0,0,0,0.55)"
                : "rgba(0,0,0,0.32)",
            },
          ]}
        >
          {isPreviewing ? (
            <Pause size={15} color="#fff" fill="#fff" />
          ) : (
            <Play size={15} color="#fff" fill="#fff" style={styles.playGlyph} />
          )}
        </View>
      </Pressable>

      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: isPreviewing ? colors.primaryText : colors.fg,
              fontFamily: typography.fontFamily,
            },
          ]}
        >
          {track.title}
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

      {track.inLibrary ? (
        <Text
          style={[
            styles.duration,
            { color: colors.fgMuted, fontFamily: typography.fontFamily },
          ]}
        >
          {track.durationMs != null
            ? formatPlayerTime(Math.round(track.durationMs / 1000))
            : ""}
        </Text>
      ) : subject ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Request ${track.title} via Lidarr`}
          hitSlop={6}
          onPress={() => onRequestDownload(subject)}
          style={styles.download}
        >
          <CloudDownload size={20} color={colors.fg} strokeWidth={2} />
        </Pressable>
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
  duration: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  download: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
