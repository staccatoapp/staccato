import type { RecommendedTrack } from "@staccato/shared";
import { CloudDownload } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { formatPlayerTime } from "@/lib/playback";
import { useTheme } from "@/theme";

import { subjectFromTrack, type LidarrSubject } from "./add-album-sheet";
import { TrackRow } from "./track-row";

interface RecTrackRowProps {
  track: RecommendedTrack;
  /** 1-based position shown in the index column; omitted hides the column. */
  index?: number;
  /** Opens the Lidarr sheet for a non-library, requestable track. */
  onRequestDownload: (subject: LidarrSubject) => void;
}

/**
 * A recommended-track row: thin adapter over the shared {@link TrackRow} that
 * maps a {@link RecommendedTrack} onto it (preview streamed through the server
 * proxy, owned-track play), with a trailing duration (in library) or Lidarr
 * request button (not in library, when the album can be requested).
 */
export function RecTrackRow({
  track,
  index,
  onRequestDownload,
}: RecTrackRowProps) {
  const { colors, typography } = useTheme();
  const subject = track.inLibrary ? null : subjectFromTrack(track);

  const subtitle = track.inLibrary
    ? [track.artistName, track.albumTitle].filter(Boolean).join(" · ")
    : `${track.artistName ?? "Unknown Artist"} · Not in library`;

  const trailing = track.inLibrary ? (
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
  ) : undefined;

  return (
    <TrackRow
      index={index}
      track={{
        recordingMbid: track.recordingMbid,
        title: track.title,
        subtitle,
        coverArtUrl: track.coverArtUrl,
        inLibrary: track.inLibrary,
        localTrackId: track.localTrackId,
        artistName: track.artistName ?? "",
      }}
      trailing={trailing}
    />
  );
}

const styles = StyleSheet.create({
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
