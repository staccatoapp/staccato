import React from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";

interface SettingsSwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** iOS-style 51×31 switch: green track when on, subtle track when off. */
export function SettingsSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: SettingsSwitchProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || !onValueChange}
      onPress={() => onValueChange?.(!value)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 16,
        padding: 2,
        backgroundColor: value ? colors.success : colors.bgSubtle,
        alignItems: value ? "flex-end" : "flex-start",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 27,
          height: 27,
          borderRadius: 27 / 2,
          backgroundColor: "#ffffff",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}
