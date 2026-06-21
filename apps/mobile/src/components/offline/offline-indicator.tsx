import { RefreshCw, WifiOff } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

interface OfflineIndicatorProps {
  /** `reconnecting` is the transient state while a probe is in flight. */
  status: "offline" | "reconnecting";
  /** Probe the server now. */
  onRetry: () => void;
}

/**
 * The offline connection banner shown above the offline Home grid: a raised
 * card with a WifiOff tile, status copy, and a "Try again" button. While
 * reconnecting it swaps to a spinner + "Reconnecting…" and disables retry.
 * Lives in `components/offline/` because other surfaces will reuse it as they
 * gain offline treatment.
 */
export function OfflineIndicator({ status, onRetry }: OfflineIndicatorProps) {
  const { colors, radius, typography } = useTheme();
  const reconnecting = status === "reconnecting";

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          backgroundColor: colors.bgRaised,
          borderWidth: 0.5,
          borderColor: colors.border,
          borderRadius: radius.card,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.errorBannerBg,
          }}
        >
          {reconnecting ? (
            <ActivityIndicator
              testID="offline-spinner"
              size="small"
              color={colors.destructive}
            />
          ) : (
            <WifiOff size={20} color={colors.destructive} strokeWidth={2} />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 15,
              fontWeight: "600",
              letterSpacing: -0.2,
              color: colors.fg,
            }}
          >
            {reconnecting ? "Reconnecting…" : "You're offline"}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 12.5,
              marginTop: 2,
              color: colors.fgMuted,
            }}
          >
            {reconnecting
              ? "Trying to reach Staccato"
              : "Playing from your downloads"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityState={{ disabled: reconnecting }}
          disabled={reconnecting}
          onPress={onRetry}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            height: 34,
            paddingHorizontal: 13,
            borderRadius: 9,
            backgroundColor: colors.bgSubtle,
          }}
        >
          <RefreshCw
            size={14}
            color={reconnecting ? colors.fgSubtle : colors.fg}
            strokeWidth={2.4}
          />
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 13,
              fontWeight: "600",
              letterSpacing: -0.1,
              color: reconnecting ? colors.fgSubtle : colors.fg,
            }}
          >
            {reconnecting ? "Retrying" : "Try again"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
