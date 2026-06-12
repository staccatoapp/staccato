import React from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { type LibrarySortKey } from "@/lib/library-sort";
import { useTheme } from "@/theme";

interface SortPillsProps {
  /** Pills to show — the active tab's applicable sort keys. */
  options: { id: LibrarySortKey; label: string }[];
  value: LibrarySortKey;
  onChange: (key: LibrarySortKey) => void;
}

/**
 * Horizontally scrollable single-select sort pills. Only the keys a tab can
 * sort by are shown (albums get all four; artists/playlists get Recently Added
 * and Title).
 */
export function SortPills({ options, value, onChange }: SortPillsProps) {
  const { colors, typography } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 4, paddingHorizontal: 16 }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: on ? "transparent" : colors.border,
              backgroundColor: on ? colors.primaryBg : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: typography.fontFamily,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.2,
                color: on ? colors.primaryText : colors.fgMuted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
