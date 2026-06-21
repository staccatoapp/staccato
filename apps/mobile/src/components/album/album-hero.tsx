import { type UnifiedAlbumDetail } from "@staccato/shared";
import { ListPlus, Play, Radio, Shuffle } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DownloadButton } from "@/components/downloads/download-button";
import { AlbumArt } from "@/components/home/album-art";
import { AvailabilityBadge } from "@/components/ui/availability-badge";
import { albumEyebrow, albumMetaLabel } from "@/lib/album-view-model";
import {
  albumServerAvailability,
  useResolvedAvailability,
} from "@/lib/availability";
import type { DownloadableCollection } from "@/lib/downloadable";
import { pickGradient } from "@/lib/gradient";
import { useTheme } from "@/theme";

const ART = 220;

interface AlbumHeroProps {
  detail: UnifiedAlbumDetail;
  /** Stable key used to colour the gradient placeholder (album id or RG MBID). */
  artKey: string;
  onPlay: () => void;
  onShuffle: () => void;
  onRequest: () => void;
  /** Offline-download descriptor for a local album; absent for external ones. */
  downloadable?: DownloadableCollection;
}

export function AlbumHero({
  detail,
  artKey,
  onPlay,
  onShuffle,
  onRequest,
  downloadable,
}: AlbumHeroProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const availability = useResolvedAvailability(
    downloadable?.id,
    albumServerAvailability(detail),
  );
  const eyebrow = albumEyebrow(detail);
  const external = detail.source === "external";

  return (
    <View style={styles.root}>
      {/* paddingTop clears the floating back/More buttons in DetailHeroLayout */}
      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {/* art + content fade together — opacity owned by DetailHeroLayout */}
        <View style={styles.artWrap}>
          <AlbumArt
            gradientKey={pickGradient(artKey)}
            artUrl={detail.album.coverArtUrl}
            size={ART}
            radius={16}
            glyphSize={62}
            badge={<AvailabilityBadge state={availability} size="hero" />}
            style={styles.art}
          />
        </View>

        {/* title block */}
        <View style={styles.titleBlock}>
          {eyebrow ? (
            <Text
              style={[styles.eyebrow, { fontFamily: typography.fontFamily }]}
            >
              {eyebrow.toUpperCase()}
            </Text>
          ) : null}
          <Text
            style={[styles.title, { fontFamily: typography.fontFamily }]}
            numberOfLines={3}
          >
            {detail.album.title}
          </Text>
          <Text
            style={[styles.artist, { fontFamily: typography.fontFamily }]}
            numberOfLines={1}
          >
            {detail.album.artistName}
          </Text>

          <View style={styles.metaRow}>
            <Text
              style={[styles.metaText, { fontFamily: typography.fontFamily }]}
            >
              {albumMetaLabel(detail)}
            </Text>
          </View>
        </View>

        {/* action zone */}
        <View style={styles.actions}>
          {external ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request via Lidarr"
              onPress={onRequest}
              style={({ pressed }) => [
                styles.requestButton,
                {
                  backgroundColor: pressed ? colors.primaryDim : colors.primary,
                },
              ]}
            >
              <Radio size={19} color="#fff" strokeWidth={2.2} />
              <Text
                style={[
                  styles.requestText,
                  { fontFamily: typography.fontFamily },
                ]}
              >
                Request via Lidarr
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Play"
                onPress={onPlay}
                style={({ pressed }) => [
                  styles.fab,
                  {
                    backgroundColor: pressed
                      ? colors.primaryDim
                      : colors.primary,
                  },
                ]}
              >
                <Play
                  size={28}
                  color="#fff"
                  fill="#fff"
                  style={styles.fabIcon}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Shuffle"
                onPress={onShuffle}
                style={styles.ghostCircle}
              >
                <Shuffle size={20} color="#fff" strokeWidth={2.1} />
              </Pressable>
              {downloadable ? (
                <DownloadButton collection={downloadable} />
              ) : null}
              <View style={styles.spacer} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add to playlist"
                style={styles.ghostCircle}
              >
                <ListPlus size={20} color="#fff" strokeWidth={2} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  artWrap: {
    alignItems: "center",
    marginTop: 18,
  },
  art: {
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  },
  titleBlock: {
    marginTop: 24,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    color: "rgba(255,255,255,0.62)",
    marginBottom: 9,
  },
  title: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.1,
    lineHeight: 40,
    color: "#fff",
  },
  artist: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    marginTop: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metaText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.62)",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 24,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
  },
  fabIcon: {
    marginLeft: 3,
  },
  ghostCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    flex: 1,
  },
  requestButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 100,
  },
  requestText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
