import { Search, X } from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

import { useTheme } from "@/theme";

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Compact 32px recipe (Library); otherwise the standard 36px height. */
  compact?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * Reusable search input: raised surface, leading magnifier, and a trailing
 * clear button shown while non-empty. Distinct from {@link TextField} (the DS
 * form input) — this is the search recipe shared across screens (Library now,
 * Explore/search later).
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  compact,
  autoFocus,
  testID,
}: SearchFieldProps) {
  const { colors, typography } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: compact ? 32 : 36,
        paddingHorizontal: compact ? 10 : 12,
        backgroundColor: colors.bgRaised,
        borderRadius: compact ? 8 : 10,
      }}
    >
      <Search size={14} color={colors.fgMuted} strokeWidth={2.2} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.fgSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoFocus={autoFocus}
        cursorColor={colors.primary}
        selectionColor={colors.primary}
        style={{
          flex: 1,
          padding: 0,
          fontFamily: typography.fontFamily,
          fontSize: 14,
          letterSpacing: -0.1,
          color: colors.fg,
        }}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <X size={14} color={colors.fgMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
