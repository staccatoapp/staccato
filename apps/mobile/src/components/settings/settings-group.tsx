import React, { type ReactNode } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/theme";

interface SettingsGroupProps {
  /** Uppercase section header above the card. */
  header?: string;
  /** Caption rendered below the card. */
  footer?: string;
  children: ReactNode;
}

/**
 * iOS grouped-list section: optional uppercase header, a raised rounded card
 * holding the rows, and an optional muted footer caption. Injects `isLast` into
 * its row children so each row can suppress its own trailing hairline.
 */
export function SettingsGroup({
  header,
  footer,
  children,
}: SettingsGroupProps) {
  const { colors, radius, typography } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={{ marginBottom: 26 }}>
      {header ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 13,
            fontWeight: "600",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: colors.fgMuted,
            paddingHorizontal: 32,
            paddingBottom: 7,
          }}
        >
          {header}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.bgRaised,
          borderRadius: radius.card,
          marginHorizontal: 16,
          overflow: "hidden",
        }}
      >
        {rows.map((child, i) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ isLast?: boolean }>,
                { isLast: i === rows.length - 1 },
              )
            : child,
        )}
      </View>
      {footer ? (
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 12.5,
            lineHeight: 18,
            color: colors.fgMuted,
            paddingHorizontal: 32,
            paddingTop: 7,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
