import type { UnifiedAlbumDetail } from "@staccato/shared";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { TrackRow } from "@/components/explore/track-row";
import { albumTrackRows, playableTrackIds } from "@/lib/album-view-model";
import { formatPlayerTime } from "@/lib/playback";
import { useContentBottomInset } from "@/lib/player-layout";
import { usePlayback } from "@/providers/playback-provider";
import { useTheme } from "@/theme";

import { AlbumHero } from "./album-hero";
import { MoreByArtist } from "./more-by-artist";

interface AlbumDetailProps {
  detail: UnifiedAlbumDetail;
  /** Route key the album was opened with (album id or RG MBID). */
  albumKey: string;
  onBack: () => void;
  onOpenAlbum: (albumKey: string) => void;
  onRequest: () => void;
}

/** Composes the album hero, tracklist, and "More by artist" rail. */
export function AlbumDetail({
  detail,
  albumKey,
  onBack,
  onOpenAlbum,
  onRequest,
}: AlbumDetailProps) {
  const { colors, typography } = useTheme();
  const { playTracks } = usePlayback();
  const bottomInset = useContentBottomInset({ tabBarAutoInset: false });

  const rows = useMemo(() => albumTrackRows(detail), [detail]);
  const playable = useMemo(() => playableTrackIds(detail), [detail]);

  // Stable per-album identity for gradient colour + rail exclusion. Local albums
  // key off their cuid id; external albums off the release-group MBID.
  const artKey =
    detail.source === "local" ? detail.album.id : detail.album.releaseGroupMbid;
  const artistKey =
    detail.source === "local" ? detail.album.artistId : detail.album.artistMbid;

  const onPlay = () => playTracks(playable, 0);
  const onShuffle = () => playTracks(shuffle(playable), 0);

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomInset }}
    >
      <AlbumHero
        detail={detail}
        artKey={artKey}
        onBack={onBack}
        onPlay={onPlay}
        onShuffle={onShuffle}
        onRequest={onRequest}
      />

      <View style={styles.tracklist}>
        <View style={[styles.card, { backgroundColor: colors.bgRaised }]}>
          {rows.map((row, i) => {
            const localId = row.track.localTrackId;
            const queueIndex = localId ? playable.indexOf(localId) : -1;
            return (
              <TrackRow
                key={`${row.track.recordingMbid || row.track.title}-${i}`}
                track={row.track}
                index={row.index}
                divider={i !== rows.length - 1}
                queueTrackIds={queueIndex >= 0 ? playable : undefined}
                queueIndex={queueIndex >= 0 ? queueIndex : undefined}
                trailing={
                  row.durationSeconds != null ? (
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
      </View>

      <MoreByArtist
        artistKey={artistKey}
        artistName={detail.album.artistName}
        currentAlbumKey={albumKey}
        onOpenAlbum={onOpenAlbum}
      />
    </ScrollView>
  );
}

/** Fisher–Yates copy, so a shuffle never mutates the source id list. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
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
});
