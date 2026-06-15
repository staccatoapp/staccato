import { Gradients } from "@staccato/shared";
import {
  BadgeCheck,
  ChevronLeft,
  Cloud,
  Download,
  ListPlus,
  MoreHorizontal,
  Play,
  Shuffle,
} from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import {
  playlistMetaLabel,
  type PlaylistView,
} from "@/lib/playlist-view-model";
import { useTheme } from "@/theme";

const ART = 196;

interface PlaylistHeroProps {
  view: PlaylistView;
  onBack: () => void;
  /** Play the whole playlist (in-library only). */
  onPlay: () => void;
  /** Open the (stub) "Add all to library" sheet (recommended only). */
  onAddAll: () => void;
}

/**
 * Immersive editorial hero, matched to the album screen: a gradient backdrop and
 * legibility scrim fading into the app background, floating cover art, oversized
 * title, an availability chip, and the action zone — play/shuffle for an owned
 * playlist, a single "Add all to library" action for a recommended one.
 */
export function PlaylistHero({
  view,
  onBack,
  onPlay,
  onAddAll,
}: PlaylistHeroProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [from, to] = Gradients[pickGradient(view.id)];
  const recommended = view.mode === "recommended";

  return (
    <View style={styles.root}>
      {/* backdrop + overlays */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(160deg, ${from}, ${to})`,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 42%)",
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.14) 34%, rgba(0,0,0,0.46) 66%, ${colors.bg} 100%)`,
          },
        ]}
      />

      <View style={[styles.content, { paddingTop: insets.top + 6 }]}>
        {/* top bar */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={8}
            style={styles.ghostNav}
          >
            <ChevronLeft size={24} color="#fff" strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            hitSlop={8}
            style={styles.ghostNav}
          >
            <MoreHorizontal size={20} color="#fff" />
          </Pressable>
        </View>

        {/* floating cover (mosaic for in-library, single for recommended) */}
        <View style={styles.artWrap}>
          <AlbumArt
            gradientKey={pickGradient(view.id)}
            artUrl={view.coverArtUrl}
            artUrls={view.coverArtUrls.length ? view.coverArtUrls : undefined}
            size={ART}
            radius={16}
            glyphSize={56}
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
            <AvailabilityChip view={view} />
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download"
                style={styles.ghostCircle}
              >
                <Download size={20} color="#fff" strokeWidth={2} />
              </Pressable>
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

function AvailabilityChip({ view }: { view: PlaylistView }) {
  const { colors, typography } = useTheme();
  const inLibrary = view.mode === "inLibrary";
  return (
    <View style={styles.chip}>
      {inLibrary ? (
        <BadgeCheck size={13} color={colors.successText} strokeWidth={2.2} />
      ) : (
        <Cloud size={13} color="rgba(255,255,255,0.7)" strokeWidth={2} />
      )}
      <Text style={[styles.chipText, { fontFamily: typography.fontFamily }]}>
        {inLibrary
          ? "In your library"
          : `${view.localCount} of ${view.total} in library`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: -6,
  },
  ghostNav: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
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
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
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
