import React, { type ReactNode } from "react";
import { Pressable } from "react-native";

import { useTheme } from "@/theme";

interface IconButtonProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/** 32px circular icon button on a raised surface (Library header chrome). */
export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.bgSubtle : colors.bgRaised,
      })}
    >
      {children}
    </Pressable>
  );
}
