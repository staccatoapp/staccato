import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (id: T) => void;
  /** Greyed, non-interactive (e.g. role control with no backend). */
  disabled?: boolean;
}

/** iOS segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.bgMuted,
        borderRadius: 9,
        padding: 2,
        gap: 2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled || !onChange}
            onPress={() => onChange?.(o.id)}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 7,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: on ? colors.bgSubtle : "transparent",
            }}
          >
            {o.icon}
            <Text
              style={{
                fontFamily: typography.fontFamily,
                fontSize: 13.5,
                fontWeight: on ? "600" : "500",
                letterSpacing: -0.2,
                color: on ? colors.fg : colors.fgMuted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
