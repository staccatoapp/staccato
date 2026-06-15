import { Gradients, type UnifiedAlbumDetail } from "@staccato/shared";
import {
  BadgeCheck,
  ChevronLeft,
  Cloud,
  Heart,
  ListPlus,
  MoreHorizontal,
  Play,
  Radio,
  Shuffle,
} from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlbumArt } from "@/components/home/album-art";
import { pickGradient } from "@/lib/gradient";
import {
  albumEyebrow,
  albumMetaLabel,
  getAlbumAvailability,
} from "@/lib/album-view-model";
import { useTheme } from "@/theme";

const ART = 220;

interface AlbumHeroProps {
  detail: UnifiedAlbumDetail;
  /** Stable key used to colour the gradient placeholder (album id or RG MBID). */
  artKey: string;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onRequest: () => void;
}

/**
 * Immersive editorial hero: a gradient backdrop with a legibility scrim fading
 * into the app background, floating artwork, oversized title, an album-level
 * availability chip, and the primary action zone (play/shuffle for owned albums;
 * "Request via Lidarr" for MusicBrainz-only ones).
 */
export function AlbumHero({
  detail,
  artKey,
  onBack,
  onPlay,
  onShuffle,
  onRequest,
}: AlbumHeroProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [from, to] = Gradients[pickGradient(artKey)];

  const availability = getAlbumAvailability(detail);
  const eyebrow = albumEyebrow(detail);
  const external = detail.source === "external";

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

        {/* floating art */}
        <View style={styles.artWrap}>
          <AlbumArt
            gradientKey={pickGradient(artKey)}
            artUrl={detail.album.coverArtUrl}
            size={ART}
            radius={16}
            glyphSize={62}
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
            <AvailabilityChip
              availability={availability}
              onRequest={external ? onRequest : undefined}
            />
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save to library"
                style={styles.ghostCircle}
              >
                <Heart size={20} color="#fff" strokeWidth={2} />
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

function AvailabilityChip({
  availability,
  onRequest,
}: {
  availability: ReturnType<typeof getAlbumAvailability>;
  onRequest?: () => void;
}) {
  const { colors, typography } = useTheme();
  let icon: React.ReactNode;
  let label: string;
  if (availability.kind === "inLibrary") {
    icon = (
      <BadgeCheck size={13} color={colors.successText} strokeWidth={2.2} />
    );
    label = "In library · Lossless";
  } else if (availability.kind === "partial") {
    icon = <Cloud size={13} color="rgba(255,255,255,0.7)" strokeWidth={2} />;
    label = `${availability.localCount} of ${availability.total} in library`;
  } else {
    icon = <Radio size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />;
    label = "Found on MusicBrainz";
  }

  return (
    <Pressable
      accessibilityRole={onRequest ? "button" : "text"}
      onPress={onRequest}
      disabled={!onRequest}
      style={styles.chip}
    >
      {icon}
      <Text style={[styles.chipText, { fontFamily: typography.fontFamily }]}>
        {label}
      </Text>
    </Pressable>
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
