import {
  type AlbumListItem,
  type Artist,
  type PlaylistListItem,
} from "@staccato/shared";
import React from "react";
import { Pressable, Text } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

import { ArtistAvatar } from "./artist-avatar";

const ART_RADIUS = 6;

function Caption({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors, typography } = useTheme();
  return (
    <>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: colors.fg,
          marginTop: 5,
        }}
      >
        {title}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 10,
          color: colors.fgMuted,
          marginTop: 1,
        }}
      >
        {subtitle}
      </Text>
    </>
  );
}

/** Album grid cell: square art + title / artist caption. */
export function AlbumCell({
  album,
  size,
  onPress,
}: {
  album: AlbumListItem;
  size: number;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ width: size }}>
      <AlbumArt
        gradientKey={pickGradient(album.id)}
        artUrl={album.coverArtUrl}
        size={size}
        radius={ART_RADIUS}
      />
      <Caption title={album.title} subtitle={album.artistName} />
    </Pressable>
  );
}

/** Playlist grid cell: mosaic/single art + name / track-count caption. */
export function PlaylistCell({
  playlist,
  size,
  onPress,
}: {
  playlist: PlaylistListItem;
  size: number;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ width: size }}>
      <AlbumArt
        gradientKey={pickGradient(playlist.id)}
        artUrls={playlist.coverArtUrls}
        size={size}
        radius={ART_RADIUS}
      />
      <Caption
        title={playlist.name}
        subtitle={`${playlist.trackCount} tracks`}
      />
    </Pressable>
  );
}

/** Artist grid cell: centered round avatar + name. */
export function ArtistCell({
  artist,
  size,
  onPress,
}: {
  artist: Artist;
  size: number;
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: size, alignItems: "center" }}>
      <ArtistAvatar
        name={artist.name}
        imageUrl={artist.imageUrl}
        gradientKey={pickGradient(artist.id)}
        size={size}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: colors.fg,
          marginTop: 6,
          textAlign: "center",
          maxWidth: "100%",
        }}
      >
        {artist.name}
      </Text>
    </Pressable>
  );
}
