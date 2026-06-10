import { TriangleAlert } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/theme";

interface ErrorBannerProps {
  /** null hides the banner but keeps the reserved slot height. */
  message: string | null;
  /** Reserved slot height so surrounding layout never jumps. */
  minHeight?: number;
}

export function ErrorBanner({ message, minHeight = 56 }: ErrorBannerProps) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={{ minHeight }}>
      {message ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            backgroundColor: colors.errorBannerBg,
            borderRadius: radius.banner,
            paddingVertical: 10,
            paddingHorizontal: 12,
            marginVertical: 10,
          }}
        >
          <TriangleAlert
            size={15}
            color={colors.destructive}
            strokeWidth={2.2}
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              flex: 1,
              fontFamily: typography.fontFamily,
              fontSize: 13.5,
              lineHeight: 13.5 * 1.45,
              color: colors.destructive,
            }}
          >
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
