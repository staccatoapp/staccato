import type {
  ExternalArtistResult,
  ExternalReleaseResult,
  ExternalSearchResults,
} from "@staccato/shared";
import { router } from "expo-router";
import { CloudDownload, Mic } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { StaccatoImage } from "@/components/staccato-image";
import { pickGradient } from "@/lib/gradient";
import { formatPlayerTime } from "@/lib/playback";
import { useTheme } from "@/theme";

import { subjectFromRelease, type LidarrSubject } from "./lidarr-sheet";
import { TrackRow } from "./track-row";

const ART = 44;

interface SearchResultsViewProps {
  results: ExternalSearchResults;
  onRequestDownload: (subject: LidarrSubject) => void;
}

/**
 * Web-style unified search results: an optional top-result card, then grouped
 * Tracks / Albums / Artists sections. Track rows play an owned track in full or
 * a lazily-resolved 30s preview (shared {@link TrackRow}); albums that resolve
 * to a release-group can be requested via Lidarr.
 */
export function SearchResultsView({
  results,
  onRequestDownload,
}: SearchResultsViewProps) {
  const { colors, typography } = useTheme();
  const { recordings, releases, artists, topResult } = results;

  const empty =
    recordings.length === 0 && releases.length === 0 && artists.length === 0;
  if (empty) {
    return (
      <View style={styles.empty}>
        <Text
          style={[
            styles.emptyText,
            { color: colors.fgMuted, fontFamily: typography.fontFamily },
          ]}
        >
          No results found.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopResult
        results={results}
        topResult={topResult}
        onRequestDownload={onRequestDownload}
      />

      {recordings.length > 0 ? (
        <Section title="Tracks">
          {recordings.map((r, i) => (
            <TrackRow
              key={r.recordingMbid}
              divider={i !== recordings.length - 1}
              track={{
                recordingMbid: r.recordingMbid,
                title: r.title,
                subtitle: [r.artistName, r.releaseName]
                  .filter(Boolean)
                  .join(" · "),
                coverArtUrl: r.coverArtUrl,
                inLibrary: r.inLibrary,
                localTrackId: r.localTrackId,
                artistName: r.artistName,
              }}
              trailing={
                r.durationMs != null ? (
                  <Text
                    style={[
                      styles.duration,
                      {
                        color: colors.fgMuted,
                        fontFamily: typography.fontFamily,
                      },
                    ]}
                  >
                    {formatPlayerTime(Math.round(r.durationMs / 1000))}
                  </Text>
                ) : undefined
              }
            />
          ))}
        </Section>
      ) : null}

      {releases.length > 0 ? (
        <Section title="Albums">
          {releases.map((r, i) => (
            <ReleaseRow
              key={r.releaseMbid}
              release={r}
              isLast={i === releases.length - 1}
              onRequestDownload={onRequestDownload}
            />
          ))}
        </Section>
      ) : null}

      {artists.length > 0 ? (
        <Section title="Artists">
          {artists.map((a, i) => (
            <ArtistRow
              key={a.artistMbid}
              artist={a}
              isLast={i === artists.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function TopResult({
  results,
  topResult,
  onRequestDownload,
}: {
  results: ExternalSearchResults;
  topResult: ExternalSearchResults["topResult"];
  onRequestDownload: (subject: LidarrSubject) => void;
}) {
  const { colors, typography } = useTheme();
  if (!topResult) return null;

  let art: ReactNode = null;
  let title = "";
  let subtitle = "";
  let trailing: ReactNode = null;
  let onPress: (() => void) | undefined;

  if (topResult.type === "recording") {
    const rec = results.recordings.find(
      (r) => r.recordingMbid === topResult.mbid,
    );
    if (!rec) return null;
    art = (
      <AlbumArt
        gradientKey={pickGradient(rec.recordingMbid)}
        artUrl={rec.coverArtUrl}
        size={56}
        radius={8}
        glyphSize={22}
      />
    );
    title = rec.title;
    subtitle = [rec.artistName, rec.releaseName].filter(Boolean).join(" · ");
  } else if (topResult.type === "release") {
    const rel = results.releases.find((r) => r.releaseMbid === topResult.mbid);
    if (!rel) return null;
    art = (
      <AlbumArt
        gradientKey={pickGradient(rel.releaseMbid)}
        artUrl={rel.coverArtUrl}
        size={56}
        radius={8}
        glyphSize={22}
      />
    );
    title = rel.title;
    subtitle = [rel.artistName, rel.releaseType, rel.releaseYear]
      .filter((v) => v != null && v !== "")
      .join(" · ");
    onPress = openReleaseAlbum(rel.releaseGroupMbid);
    const subject = subjectFromRelease(rel);
    if (subject)
      trailing = (
        <DownloadButton subject={subject} onPress={onRequestDownload} />
      );
  } else {
    const artist = results.artists.find((a) => a.artistMbid === topResult.mbid);
    if (!artist) return null;
    art = <ArtistAvatar imageUrl={artist.imageUrl} size={56} />;
    title = artist.name;
    subtitle = artist.disambiguation ?? artist.type ?? "Artist";
  }

  return (
    <View style={styles.topWrap}>
      <Text
        style={[
          styles.eyebrow,
          { color: colors.fgMuted, fontFamily: typography.fontFamily },
        ]}
      >
        Top result
      </Text>
      <View style={[styles.topCard, { backgroundColor: colors.bgRaised }]}>
        <Pressable
          accessibilityRole={onPress ? "button" : undefined}
          onPress={onPress}
          disabled={!onPress}
          style={styles.topMain}
        >
          {art}
          <View style={styles.topText}>
            <Text
              numberOfLines={1}
              style={[
                styles.topTitle,
                { color: colors.fg, fontFamily: typography.fontFamily },
              ]}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.topSubtitle,
                { color: colors.fgMuted, fontFamily: typography.fontFamily },
              ]}
            >
              {subtitle}
            </Text>
          </View>
        </Pressable>
        {trailing}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.fgMuted, fontFamily: typography.fontFamily },
        ]}
      >
        {title}
      </Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.bgRaised }]}>
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
  titleColor,
  isLast,
  onPress,
}: {
  art: ReactNode;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  titleColor?: string;
  isLast: boolean;
  /** When set, art + text become a tap target; the trailing slot stays its own. */
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        onPress={onPress}
        disabled={!onPress}
        style={styles.rowMain}
      >
        {art}
        <View style={styles.rowText}>
          <Text
            numberOfLines={1}
            style={[
              styles.rowTitle,
              {
                color: titleColor ?? colors.fg,
                fontFamily: typography.fontFamily,
              },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[
                styles.rowSubtitle,
                { color: colors.fgMuted, fontFamily: typography.fontFamily },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {trailing}
      {!isLast ? (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      ) : null}
    </View>
  );
}

/** Navigate to album detail by release-group MBID, or null when unavailable. */
function openReleaseAlbum(
  releaseGroupMbid: string | null,
): (() => void) | undefined {
  if (!releaseGroupMbid) return undefined;
  return () =>
    router.push({
      pathname: "/(home)/explore/album/[albumKey]",
      params: { albumKey: releaseGroupMbid },
    });
}

function ReleaseRow({
  release,
  isLast,
  onRequestDownload,
}: {
  release: ExternalReleaseResult;
  isLast: boolean;
  onRequestDownload: (subject: LidarrSubject) => void;
}) {
  const subject = subjectFromRelease(release);
  return (
    <Row
      isLast={isLast}
      onPress={openReleaseAlbum(release.releaseGroupMbid)}
      art={
        <AlbumArt
          gradientKey={pickGradient(release.releaseMbid)}
          artUrl={release.coverArtUrl}
          size={ART}
          radius={6}
          glyphSize={18}
        />
      }
      title={release.title}
      subtitle={[release.artistName, release.releaseType, release.releaseYear]
        .filter((v) => v != null && v !== "")
        .join(" · ")}
      trailing={
        subject ? (
          <DownloadButton subject={subject} onPress={onRequestDownload} />
        ) : undefined
      }
    />
  );
}

function ArtistRow({
  artist,
  isLast,
}: {
  artist: ExternalArtistResult;
  isLast: boolean;
}) {
  return (
    <Row
      isLast={isLast}
      art={<ArtistAvatar imageUrl={artist.imageUrl} size={ART} />}
      title={artist.name}
      subtitle={artist.disambiguation ?? artist.type ?? ""}
    />
  );
}

function ArtistAvatar({
  imageUrl,
  size,
}: {
  imageUrl: string | null;
  size: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bgSubtle,
        },
      ]}
    >
      <StaccatoImage
        uri={imageUrl}
        fallback={<Mic size={Math.round(size * 0.32)} color={colors.fgMuted} />}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    </View>
  );
}

function DownloadButton({
  subject,
  onPress,
}: {
  subject: LidarrSubject;
  onPress: (subject: LidarrSubject) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Request ${subject.title} via Lidarr`}
      hitSlop={6}
      onPress={() => onPress(subject)}
      style={styles.download}
    >
      <CloudDownload size={20} color={colors.fg} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: 8,
  },
  empty: {
    paddingHorizontal: 20,
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
  },
  topWrap: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 4,
    paddingTop: 4,
    marginBottom: 8,
  },
  topCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  topMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  topText: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  topSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  sectionBody: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    position: "absolute",
    left: 64,
    right: 0,
    bottom: 0,
    height: 0.5,
  },
  duration: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  download: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
