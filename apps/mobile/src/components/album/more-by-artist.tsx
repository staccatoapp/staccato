import type { ArtistDiscographyItem } from "@staccato/shared";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { AvailabilityBadge } from "@/components/ui/availability-badge";
import { useArtistDetail } from "@/hooks/use-artist-detail";
import { useResolvedAvailability } from "@/lib/availability";
import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

const TILE = 132;

interface MoreByArtistProps {
  /** Local cuid2 artist id or MB artist MBID, or null/undefined to skip. */
  artistKey: string | null | undefined;
  artistName: string;
  /** Album key (id or RG MBID) currently open — excluded from the rail. */
  currentAlbumKey: string;
  onOpenAlbum: (albumKey: string) => void;
}

/** The album key used for navigation, distinct per discography item source. */
function itemKey(item: ArtistDiscographyItem): string {
  return item.inLibrary ? item.id : item.releaseGroupMbid;
}

/**
 * Horizontal rail of the artist's other releases. Hidden while loading or when
 * the artist has no other albums.
 */
export function MoreByArtist({
  artistKey,
  artistName,
  currentAlbumKey,
  onOpenAlbum,
}: MoreByArtistProps) {
  const { colors, typography } = useTheme();
  const { data } = useArtistDetail(artistKey ?? undefined);

  const albums = (data?.albums ?? []).filter(
    (a) => itemKey(a) !== currentAlbumKey,
  );
  if (albums.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text
        style={[
          styles.heading,
          { color: colors.fg, fontFamily: typography.fontFamily },
        ]}
      >
        More by {artistName}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {albums.map((album) => {
          const key = itemKey(album);
          return (
            <DiscographyTile
              key={key}
              album={album}
              albumKey={key}
              onOpen={() => onOpenAlbum(key)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * One album tile in the rail. A sub-component so each can resolve its own
 * availability badge (in-library albums may be downloaded; external ones are
 * recommended).
 */
function DiscographyTile({
  album,
  albumKey,
  onOpen,
}: {
  album: ArtistDiscographyItem;
  albumKey: string;
  onOpen: () => void;
}) {
  const { colors, typography } = useTheme();
  const availability = useResolvedAvailability(
    album.inLibrary ? album.id : undefined,
    album.inLibrary ? "inLibrary" : "recommended",
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={album.title}
      onPress={onOpen}
      style={styles.tile}
    >
      <AlbumArt
        gradientKey={pickGradient(albumKey)}
        artUrl={album.coverArtUrl}
        size={TILE}
        radius={10}
        badge={<AvailabilityBadge state={availability} size="tile" />}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.tileTitle,
          { color: colors.fg, fontFamily: typography.fontFamily },
        ]}
      >
        {album.title}
      </Text>
      {album.releaseYear != null ? (
        <Text
          style={[
            styles.tileYear,
            { color: colors.fgMuted, fontFamily: typography.fontFamily },
          ]}
        >
          {album.releaseYear}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  rail: {
    paddingHorizontal: 18,
    gap: 14,
  },
  tile: {
    width: TILE,
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  tileYear: {
    fontSize: 12,
    marginTop: 1,
  },
});
