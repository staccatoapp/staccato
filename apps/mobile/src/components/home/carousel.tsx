import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  type HomeAlbum,
  type HomeMix,
  type HomePlaylist,
} from "@/lib/home-types";
import { AlbumArt } from "@/components/home/album-art";
import { useTheme } from "@/theme";

const CARD_WIDTH = 138;
const CARD_GAP = 12;

type CarouselItem = HomeAlbum | HomeMix | HomePlaylist;

interface CarouselProps {
  title: string;
  items: CarouselItem[];
  onSeeAll?: () => void;
}

interface CarouselCardProps {
  item: CarouselItem;
  onPress?: () => void;
}

/** Horizontally snap-scrolling section with a title header. */
export function Carousel({ title, items, onSeeAll }: CarouselProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={styles.section}>
      <View
        style={[
          styles.headerRow,
          { paddingHorizontal: spacing.homeScreenPadding },
        ]}
      >
        <Text
          style={[
            styles.title,
            { color: colors.fg, fontFamily: typography.fontFamily },
          ]}
        >
          {title}
        </Text>
        <Pressable accessibilityRole="button" onPress={onSeeAll}>
          <Text
            style={[
              styles.seeAll,
              { color: colors.primaryText, fontFamily: typography.fontFamily },
            ]}
          >
            See all
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={[
          styles.scrollRow,
          { paddingHorizontal: spacing.homeScreenPadding },
        ]}
      >
        {items.map((item) => (
          <CarouselCard key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function cardTitle(item: CarouselItem): string {
  return "title" in item ? item.title : item.name;
}

function cardSubtitle(item: CarouselItem): string {
  if ("artistName" in item) return item.artistName;
  if ("subtitle" in item) return item.subtitle;
  return `${item.trackCount} tracks`;
}

/** 138pt album-art card with two lines of text. */
export function CarouselCard({ item, onPress }: CarouselCardProps) {
  const { colors, radius, typography } = useTheme();

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <AlbumArt
        gradientKey={item.gradientKey}
        artUrl={"artUrls" in item ? undefined : item.artUrl}
        artUrls={"artUrls" in item ? item.artUrls : undefined}
        size={CARD_WIDTH}
        radius={radius.carouselArt}
      />
      <Text
        style={[
          styles.cardTitle,
          { color: colors.fg, fontFamily: typography.fontFamily },
        ]}
        numberOfLines={1}
      >
        {cardTitle(item)}
      </Text>
      <Text
        style={[
          styles.cardSubtitle,
          { color: colors.fgMuted, fontFamily: typography.fontFamily },
        ]}
        numberOfLines={1}
      >
        {cardSubtitle(item)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "500",
  },
  scrollRow: {
    gap: CARD_GAP,
    paddingBottom: 4,
  },
  card: {
    width: CARD_WIDTH,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
    marginTop: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
});
