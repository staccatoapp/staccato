import { Download, ListPlus, Play, Shuffle } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DownloadButton } from "@/components/downloads/download-button";
import { AlbumArt } from "@/components/home/album-art";
import { AvailabilityBadge } from "@/components/ui/availability-badge";
import {
  availabilityFromCounts,
  useResolvedAvailability,
} from "@/lib/availability";
import type { DownloadableCollection } from "@/lib/downloadable";
import { pickGradient } from "@/lib/gradient";
import {
  playlistMetaLabel,
  type PlaylistView,
} from "@/lib/playlist-view-model";
import { useTheme } from "@/theme";

const ART = 196;

interface PlaylistHeroProps {
  view: PlaylistView;
  /** Play the whole playlist (in-library only). */
  onPlay: () => void;
  /** Open the (stub) "Add all to library" sheet (recommended only). */
  onAddAll: () => void;
  /** Offline-download descriptor for an in-library playlist; absent otherwise. */
  downloadable?: DownloadableCollection;
}

export function PlaylistHero({
  view,
  onPlay,
  onAddAll,
  downloadable,
}: PlaylistHeroProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const recommended = view.mode === "recommended";
  const availability = useResolvedAvailability(
    downloadable?.id,
    availabilityFromCounts(view.localCount, view.total),
  );

  return (
    <View style={styles.root}>
      {/* paddingTop clears the floating back/More buttons in DetailHeroLayout */}
      <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
        {/* art + content fade together — opacity owned by DetailHeroLayout */}
        <View style={styles.artWrap}>
          <AlbumArt
            gradientKey={pickGradient(view.id)}
            artUrl={view.coverArtUrl}
            artUrls={view.coverArtUrls.length ? view.coverArtUrls : undefined}
            size={ART}
            radius={16}
            glyphSize={56}
            badge={<AvailabilityBadge state={availability} size="hero" />}
            style={styles.art}
          />
        </View>

        {/* title block */}
        <View style={styles.titleBlock}>
          {view.source ? (
            <Text
              style={[styles.eyebrow, { fontFamily: typography.fontFamily }]}
            >
              {view.source.toUpperCase()}
            </Text>
          ) : null}
          <Text
            style={[styles.title, { fontFamily: typography.fontFamily }]}
            numberOfLines={3}
          >
            {view.name}
          </Text>
          {view.description ? (
            <Text
              style={[styles.tagline, { fontFamily: typography.fontFamily }]}
              numberOfLines={2}
            >
              {view.description}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text
              style={[styles.metaText, { fontFamily: typography.fontFamily }]}
            >
              {playlistMetaLabel(view)}
            </Text>
          </View>
        </View>

        {/* action zone */}
        <View style={styles.actions}>
          {recommended ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add all to library"
              onPress={onAddAll}
              style={({ pressed }) => [
                styles.requestButton,
                {
                  backgroundColor: pressed ? colors.primaryDim : colors.primary,
                },
              ]}
            >
              <Download size={19} color="#fff" strokeWidth={2.2} />
              <Text
                style={[
                  styles.requestText,
                  { fontFamily: typography.fontFamily },
                ]}
              >
                Add all to library
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
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1.1,
    lineHeight: 38,
    color: "#fff",
  },
  tagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 10,
    lineHeight: 20,
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
