import { CloudDownload } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { type LidarrSubject } from "@/components/explore/lidarr-sheet";
import { TrackRow } from "@/components/explore/track-row";
import { formatPlayerTime } from "@/lib/playback";
import { type PlaylistView } from "@/lib/playlist-view-model";
import { usePlayback } from "@/providers/playback-provider";
import { useTheme } from "@/theme";

import { PlaylistHero } from "./playlist-hero";
import { PlaylistSuggestions } from "./playlist-suggestions";

interface PlaylistDetailProps {
  view: PlaylistView;
  onBack: () => void;
  /** Open the Lidarr sheet for a not-in-library track (recommended playlists). */
  onRequestTrack: (subject: LidarrSubject) => void;
  /** Open the (stub) "Add all to library" sheet (recommended playlists). */
  onAddAll: () => void;
}

/** Composes the playlist hero, tracklist, and (in-library) suggested-tracks block. */
export function PlaylistDetail({
  view,
  onBack,
  onRequestTrack,
  onAddAll,
}: PlaylistDetailProps) {
  const { colors, typography } = useTheme();
  const { playTracks } = usePlayback();

  const { playableTrackIds, rows } = view;
  const onPlay = () => {
    if (playableTrackIds.length > 0) playTracks(playableTrackIds, 0);
  };

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <PlaylistHero
        view={view}
        onBack={onBack}
        onPlay={onPlay}
        onAddAll={onAddAll}
      />

      <View style={styles.tracklist}>
        <View style={[styles.card, { backgroundColor: colors.bgRaised }]}>
          {rows.map((row, i) => {
            const localId = row.track.localTrackId;
            const queueIndex = localId ? playableTrackIds.indexOf(localId) : -1;
            const subject = row.requestSubject;
            return (
              <TrackRow
                key={`${row.track.recordingMbid || row.track.title}-${i}`}
                track={row.track}
                index={row.index}
                divider={i !== rows.length - 1}
                queueTrackIds={queueIndex >= 0 ? playableTrackIds : undefined}
                queueIndex={queueIndex >= 0 ? queueIndex : undefined}
                trailing={
                  subject ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Request ${row.track.title} via Lidarr`}
                      hitSlop={6}
                      onPress={() => onRequestTrack(subject)}
                      style={styles.download}
                    >
                      <CloudDownload
                        size={20}
                        color={colors.fg}
                        strokeWidth={2}
                      />
                    </Pressable>
                  ) : row.durationSeconds != null ? (
                    <Text
                      style={[
                        styles.duration,
                        {
                          color: colors.fgMuted,
                          fontFamily: typography.fontFamily,
                        },
                      ]}
                    >
                      {formatPlayerTime(row.durationSeconds)}
                    </Text>
                  ) : undefined
                }
              />
            );
          })}
        </View>

        {view.mode === "inLibrary" ? (
          <PlaylistSuggestions
            playlistId={view.id}
            onRequestDownload={onRequestTrack}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
  },
  tracklist: {
    marginTop: 4,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 2,
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
