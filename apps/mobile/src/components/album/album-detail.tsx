import {
  Gradients,
  type PlaybackSource,
  type UnifiedAlbumDetail,
} from "@staccato/shared";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DetailHeroLayout } from "@/components/detail-hero-layout";
import { TrackRow } from "@/components/explore/track-row";
import { pickGradient } from "@/lib/gradient";
import { albumTrackRows, playableTrackIds } from "@/lib/album-view-model";
import { formatPlayerTime } from "@/lib/playback";
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

  const rows = useMemo(() => albumTrackRows(detail), [detail]);
  const playable = useMemo(() => playableTrackIds(detail), [detail]);

  // Stable per-album identity for gradient colour + rail exclusion. Local albums
  // key off their cuid id; external albums off the release-group MBID.
  const artKey =
    detail.source === "local" ? detail.album.id : detail.album.releaseGroupMbid;
  const artistKey =
    detail.source === "local" ? detail.album.artistId : detail.album.artistMbid;

  // Only owned (local) albums have playable tracks and a stable id to attribute
  // recently-played to; external albums are preview-only so source is moot.
  const source: PlaybackSource | undefined =
    detail.source === "local"
      ? { type: "album", id: detail.album.id }
      : undefined;

  const onPlay = () => playTracks(playable, 0, source);
  const onShuffle = () => playTracks(shuffle(playable), 0, source);

  return (
    <DetailHeroLayout
      title={detail.album.title}
      gradientColors={Gradients[pickGradient(artKey)]}
      onBack={onBack}
      hero={
        <AlbumHero
          detail={detail}
          artKey={artKey}
          onPlay={onPlay}
          onShuffle={onShuffle}
          onRequest={onRequest}
        />
      }
    >
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
                source={source}
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
    </DetailHeroLayout>
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
