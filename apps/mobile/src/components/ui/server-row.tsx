import { displayHost } from "@staccato/shared";
import { ChevronRight, Server } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

interface ServerRowProps {
  url: string;
  note: string;
  onPress: () => void;
  isLast?: boolean;
}

/** Recent-server row: blue icon tile, scheme-stripped host, note, chevron. */
export function ServerRow({
  url,
  note,
  onPress,
  isLast = false,
}: ServerRowProps) {
  const { colors, radius, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: pressed ? colors.bgMuted : "transparent",
      })}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.iconTile,
          backgroundColor: colors.serverBlue,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Server size={17} color="#ffffff" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 15.5,
            fontWeight: "500",
            letterSpacing: -0.2,
            color: colors.fg,
          }}
        >
          {displayHost(url)}
        </Text>
        <Text
          style={{
            fontFamily: typography.fontFamily,
            fontSize: 13,
            color: colors.fgMuted,
            marginTop: 2,
          }}
        >
          {note}
        </Text>
      </View>
      <ChevronRight size={17} color={colors.fgSubtle} />
      {!isLast ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 58,
            right: 0,
            height: 1,
            backgroundColor: colors.border,
          }}
        />
      ) : null}
    </Pressable>
  );
}
