import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MediaTile, type MediaTileItem } from "@/components/ui/media-tile";
import { useTheme } from "@/theme";

const CARD_WIDTH = 138;
const CARD_GAP = 12;

interface CarouselProps {
  title: string;
  items: MediaTileItem[];
  onSeeAll?: () => void;
  onPressItem?: (item: MediaTileItem) => void;
}

/** Horizontally snap-scrolling section with a title header. */
export function Carousel({
  title,
  items,
  onSeeAll,
  onPressItem,
}: CarouselProps) {
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
          <MediaTile
            key={item.id}
            item={item}
            size={CARD_WIDTH}
            onPress={onPressItem ? () => onPressItem(item) : undefined}
          />
        ))}
      </ScrollView>
    </View>
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
});
