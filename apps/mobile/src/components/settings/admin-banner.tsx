import { ShieldCheck } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/theme";

/** Tinted caption shown atop admin surfaces ("changes apply to everyone"). */
export function AdminBanner({ children }: { children: string }) {
  const { colors, radius, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginHorizontal: 16,
        marginBottom: 22,
        paddingVertical: 11,
        paddingHorizontal: 13,
        borderRadius: radius.banner,
        backgroundColor: colors.primaryBg,
      }}
    >
      <ShieldCheck size={16} color={colors.primaryText} strokeWidth={2} />
      <Text
        style={{
          flex: 1,
          fontFamily: typography.fontFamily,
          fontSize: 12.5,
          lineHeight: 17,
          color: colors.primaryText,
          letterSpacing: -0.1,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
