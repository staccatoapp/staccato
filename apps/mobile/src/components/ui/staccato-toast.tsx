import { Check, TriangleAlert } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast, {
  type ToastConfig,
  type ToastConfigParams,
} from "react-native-toast-message";

import { useTheme } from "@/theme";

/**
 * The single toast surface for the app. Wraps `react-native-toast-message` so
 * callers never touch its raw API: mount {@link StaccatoToastHost} once at the
 * root and trigger toasts through the {@link staccatoToast} helper. Keeping the
 * config internal means every toast shares one OLED-pill look and the helper is
 * the only sanctioned entrypoint, so future toasts stay consistent.
 */

/** Compact pill on the app's raised surface, shared by every toast variant. */
function ToastPill({ text1, icon }: { text1?: string; icon: React.ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.bgRaised, borderColor: colors.border },
      ]}
    >
      {icon}
      <Text
        numberOfLines={2}
        style={[
          styles.text,
          { color: colors.fg, fontFamily: typography.fontFamily },
        ]}
      >
        {text1}
      </Text>
    </View>
  );
}

function SuccessToast({ text1 }: ToastConfigParams<unknown>) {
  const { colors } = useTheme();
  return (
    <ToastPill
      text1={text1}
      icon={<Check size={18} color={colors.successText} strokeWidth={2.6} />}
    />
  );
}

function ErrorToast({ text1 }: ToastConfigParams<unknown>) {
  const { colors } = useTheme();
  return (
    <ToastPill
      text1={text1}
      icon={
        <TriangleAlert size={18} color={colors.destructive} strokeWidth={2.4} />
      }
    />
  );
}

const staccatoToastConfig: ToastConfig = {
  success: (params) => <SuccessToast {...params} />,
  error: (params) => <ErrorToast {...params} />,
};

/**
 * Root-mounted toast renderer. Sits above the player overlay (mounted last in
 * `app/_layout.tsx`) so confirmations float over the full-screen Now Playing
 * panel; offset below the status bar / notch.
 */
export function StaccatoToastHost() {
  const insets = useSafeAreaInsets();
  return (
    <Toast
      config={staccatoToastConfig}
      position="top"
      topOffset={insets.top + 8}
    />
  );
}

/** The app's only toast entrypoint. Keeps every toast on the same recipe. */
export const staccatoToast = {
  success(message: string) {
    Toast.show({ type: "success", text1: message });
  },
  error(message: string) {
    Toast.show({ type: "error", text1: message });
  },
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "92%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});
