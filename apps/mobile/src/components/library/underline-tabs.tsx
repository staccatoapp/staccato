import React from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

export interface UnderlineTabOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface UnderlineTabsProps<T extends string> {
  options: UnderlineTabOption<T>[];
  value: T;
  onChange: (id: T) => void;
}

/**
 * Underline tab row with item counts (Library Albums/Artists/Playlists). Active
 * tab is 700 `fg` with a 2px indicator over the bottom hairline.
 */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: UnderlineTabsProps<T>) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 18,
        paddingHorizontal: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              paddingTop: 8,
              paddingBottom: 10,
              flexDirection: "row",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <Text
              style={{
                fontFamily: typography.fontFamily,
                fontSize: 15,
                fontWeight: on ? "700" : "500",
                letterSpacing: -0.2,
                color: on ? colors.fg : colors.fgMuted,
              }}
            >
              {o.label}
            </Text>
            {o.count != null ? (
              <Text
                style={{
                  fontFamily: typography.fontFamily,
                  fontSize: 11,
                  fontWeight: "500",
                  color: colors.fgSubtle,
                }}
              >
                {o.count}
              </Text>
            ) : null}
            {on ? (
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -0.5,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: colors.fg,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
