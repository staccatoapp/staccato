import { ChevronRight } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

interface SettingsRowProps {
  /** Pre-sized node rendered inside the 30×30 colored tile (lucide icon or initial). */
  icon?: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned value text. */
  value?: string;
  valueColor?: string;
  /** Custom right-aligned node (switch, badge, etc.), placed before the chevron. */
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  /** Destructive (red) title; centered action style. */
  danger?: boolean;
  /** Centered title (action rows like "Sign Out"). */
  center?: boolean;
  /** Greyed, non-interactive placeholder for un-backed features. */
  dim?: boolean;
  isLast?: boolean;
}

/**
 * A single iOS-style settings row: optional icon tile, title + subtitle, a
 * trailing value/node, an optional chevron, and a hairline separator unless it
 * is the last row in its group. `dim` renders a greyed, non-tappable placeholder.
 */
export function SettingsRow({
  icon,
  iconBg,
  title,
  subtitle,
  value,
  valueColor,
  trailing,
  chevron,
  onPress,
  danger,
  center,
  dim,
  isLast,
}: SettingsRowProps) {
  const { colors, radius, typography } = useTheme();
  const tappable = !!onPress && !dim;

  const titleColor = danger
    ? colors.destructive
    : center
      ? colors.primaryText
      : colors.fg;

  return (
    <Pressable
      accessibilityRole={tappable ? "button" : undefined}
      disabled={!tappable}
      onPress={tappable ? onPress : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        paddingVertical: 9,
        paddingHorizontal: 16,
        opacity: dim ? 0.4 : 1,
        justifyContent: center ? "center" : "flex-start",
        backgroundColor: pressed && tappable ? colors.bgMuted : "transparent",
      })}
    >
      {icon ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.iconTile,
            backgroundColor: iconBg ?? colors.fgSubtle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
      ) : null}

      {center ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 16.5,
            fontWeight: "500",
            letterSpacing: -0.3,
            color: titleColor,
          }}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 16.5,
              letterSpacing: -0.3,
              color: titleColor,
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: typography.fontFamily,
                fontSize: 12.5,
                color: colors.fgMuted,
                marginTop: 2,
                letterSpacing: -0.1,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}

      {value != null ? (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 16.5,
            letterSpacing: -0.3,
            maxWidth: 170,
            color: valueColor ?? colors.fgMuted,
          }}
        >
          {value}
        </Text>
      ) : null}

      {trailing}

      {chevron ? (
        <ChevronRight size={18} color={colors.fgSubtle} strokeWidth={2} />
      ) : null}

      {!isLast ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            left: icon ? 58 : 16,
            height: 1,
            backgroundColor: colors.border,
          }}
        />
      ) : null}
    </Pressable>
  );
}
