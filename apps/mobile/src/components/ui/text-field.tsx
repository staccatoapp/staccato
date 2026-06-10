import React, { useState, type ReactNode } from "react";
import {
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** Error state is owned by the parent; it also clears it on change. */
  error?: boolean;
  /** Trailing control (e.g. show/hide-password toggle), right-aligned. */
  trailingSlot?: ReactNode;
  testID?: string;
}

const TRANSITION_MS = 150;

/**
 * DS text input: 50px, raised surface, hairline border; orange focus ring
 * (suppressed in the error state), destructive border on error.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  autoCorrect = false,
  returnKeyType,
  onSubmitEditing,
  error = false,
  trailingSlot,
  testID,
}: TextFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.destructive
    : focused
      ? colors.focusBorder
      : colors.inputBorder;
  const showRing = focused && !error;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(borderColor, { duration: TRANSITION_MS }),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showRing ? 1 : 0, { duration: TRANSITION_MS }),
  }));

  return (
    <View>
      {/* 3px outer focus ring (RN has no box-shadow ring) */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -4,
            bottom: -4,
            left: -4,
            right: -4,
            borderRadius: radius.input + 4,
            borderWidth: 3,
            borderColor: colors.focusRing,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            height: spacing.controlHeight,
            backgroundColor: colors.bgRaised,
            borderRadius: radius.input,
            borderWidth: 1,
          },
          borderStyle,
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.fgSubtle}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          spellCheck={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          cursorColor={colors.primary}
          selectionColor={colors.primary}
          style={{
            flex: 1,
            paddingLeft: 16,
            paddingRight: trailingSlot ? 52 : 16,
            fontFamily: typography.fontFamily,
            fontSize: 16.5,
            letterSpacing: -0.2,
            color: colors.fg,
          }}
        />
      </Animated.View>
      {trailingSlot ? (
        <View
          style={{
            position: "absolute",
            right: 3,
            top: 0,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          {trailingSlot}
        </View>
      ) : null}
    </View>
  );
}
