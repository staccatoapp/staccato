import {
  type LibrarySearchResults as LibrarySearchResultsData,
  type PlaylistListItem,
} from "@staccato/shared";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

import { EmptyState } from "./empty-state";

const ART = 40;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ marginBottom: 4 }}>
      <Text
        style={{
          fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: colors.fgMuted,
          paddingTop: 14,
          paddingBottom: 8,
          paddingHorizontal: 20,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          marginHorizontal: 16,
          backgroundColor: colors.bgRaised,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  art,
  title,
  subtitle,
  trailing,
  isLast,
  onPress,
}: {
  art: ReactNode;
  title: string;
  subtitle: string;
  trailing: ReactNode;
  isLast: boolean;
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
      }}
    >
      {art}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 14,
            fontWeight: "500",
            letterSpacing: -0.1,
            color: colors.fg,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 12,
            color: colors.fgMuted,
            marginTop: 1,
          }}
        >
          {subtitle}
        </Text>
      </View>
      {trailing}
      {!isLast ? (
        <View
          style={{
            position: "absolute",
            left: 64,
            right: 0,
            bottom: 0,
            height: 0.5,
            backgroundColor: colors.border,
          }}
        />
      ) : null}
    </Pressable>
  );
}

interface LibrarySearchResultsProps {
  query: string;
  data: LibrarySearchResultsData | undefined;
  /** Playlists filtered client-side by name (web parity). */
  playlists: PlaylistListItem[];
}

/**
 * Explore-style grouped results (Tracks · Albums · Playlists). Artists are
 * intentionally not surfaced (the Library design folds artist matches into
 * their tracks/albums). Taps are TODO no-ops until detail screens / the player
 * exist in the mobile app.
 */
export function LibrarySearchResults({
  query,
  data,
  playlists,
}: LibrarySearchResultsProps) {
  const { colors, typography } = useTheme();
  const tracks = data?.tracks ?? [];
  const albums = data?.albums ?? [];

  const empty =
    tracks.length === 0 && albums.length === 0 && playlists.length === 0;
  if (empty) return <EmptyState query={query} />;

  const chevron = <ChevronRight size={14} color={colors.fgSubtle} />;

  return (
    <View style={{ paddingBottom: 8 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: colors.fgMuted,
            marginBottom: 4,
          }}
        >
          Results for
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 18,
            fontWeight: "600",
            letterSpacing: -0.3,
            color: colors.fg,
          }}
        >
          {query}
        </Text>
      </View>

      {tracks.length > 0 ? (
        <Section title="Tracks">
          {tracks.map((t, i) => (
            <Row
              key={t.id}
              isLast={i === tracks.length - 1}
              art={
                <AlbumArt
                  gradientKey={pickGradient(t.id)}
                  artUrl={t.coverArtUrl}
                  size={ART}
                  radius={6}
                />
              }
              title={t.title}
              subtitle={[t.artistName, t.albumTitle]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <Text
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: 12,
                    color: colors.fgMuted,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatDuration(t.durationSeconds)}
                </Text>
              }
            />
          ))}
        </Section>
      ) : null}

      {albums.length > 0 ? (
        <Section title="Albums">
          {albums.map((a, i) => (
            <Row
              key={a.id}
              isLast={i === albums.length - 1}
              art={
                <AlbumArt
                  gradientKey={pickGradient(a.id)}
                  artUrl={a.coverArtUrl}
                  size={ART}
                  radius={6}
                />
              }
              title={a.title}
              subtitle={[a.artistName, a.releaseYear ?? undefined]
                .filter((v) => v != null && v !== "")
                .join(" · ")}
              trailing={chevron}
              onPress={() =>
                router.push({
                  pathname: "/(home)/library/album/[albumKey]",
                  params: { albumKey: a.id },
                })
              }
            />
          ))}
        </Section>
      ) : null}

      {playlists.length > 0 ? (
        <Section title="Playlists">
          {playlists.map((p, i) => (
            <Row
              key={p.id}
              isLast={i === playlists.length - 1}
              art={
                <AlbumArt
                  gradientKey={pickGradient(p.id)}
                  artUrls={p.coverArtUrls}
                  size={ART}
                  radius={6}
                />
              }
              title={p.name}
              subtitle={`${p.trackCount} tracks`}
              trailing={chevron}
              onPress={() =>
                router.push({
                  pathname: "/(home)/library/playlist/[playlistKey]",
                  params: { playlistKey: p.id },
                })
              }
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}
