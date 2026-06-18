import { type GradientKey } from "@staccato/shared";
import { Info } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AlbumArt } from "@/components/home/album-art";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useTheme } from "@/theme";

interface SheetHeader {
  artUrl: string | null;
  artUrls?: string[];
  gradientKey: GradientKey;
  title: string;
  subtitle: string;
}

interface SheetInfo {
  text: React.ReactNode;
  /** "primary" → orange banner with border; "muted" → grey block, no border. */
  variant: "primary" | "muted";
}

interface SheetCta {
  label: string;
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}

export interface LidarrSheetProps {
  open: boolean;
  onClose: () => void;
  header: SheetHeader;
  info: SheetInfo;
  cta: SheetCta;
  error?: string;
  showCancel?: boolean;
  testID?: string;
  backdropTestID?: string;
}

/**
 * Shared layout shell for Lidarr-flavoured bottom sheets. Renders art header,
 * info block, optional error, CTA, and optional cancel button inside a
 * BottomSheet. Not used directly by screens — use AddAlbumSheet or AddAllSheet.
 */
export function LidarrSheet({
  open,
  onClose,
  header,
  info,
  cta,
  error,
  showCancel,
  testID,
  backdropTestID,
}: LidarrSheetProps) {
  const { colors, typography } = useTheme();

  const infoBg = info.variant === "primary" ? colors.primaryBg : colors.bgMuted;
  const infoBorder =
    info.variant === "primary" ? "rgba(253, 121, 51, 0.35)" : undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      testID={testID}
      backdropTestID={backdropTestID}
    >
      <View style={styles.header}>
        <AlbumArt
          gradientKey={header.gradientKey}
          artUrl={header.artUrl}
          artUrls={header.artUrls}
          size={56}
          radius={8}
          glyphSize={22}
        />
        <View style={styles.headerText}>
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              { color: colors.fg, fontFamily: typography.fontFamily },
            ]}
          >
            {header.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.subtitle,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            {header.subtitle}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.info,
          {
            backgroundColor: infoBg,
            borderWidth: infoBorder ? 1 : 0,
            borderColor: infoBorder,
          },
        ]}
      >
        <Info size={16} color={colors.primaryText} strokeWidth={2} />
        <Text
          style={[
            styles.infoText,
            { color: colors.fg, fontFamily: typography.fontFamily },
          ]}
        >
          {info.text}
        </Text>
      </View>

      {error ? (
        <Text
          style={[
            styles.error,
            { color: colors.destructive, fontFamily: typography.fontFamily },
          ]}
        >
          {error}
        </Text>
      ) : null}

      <Pressable
        testID={cta.testID}
        accessibilityRole="button"
        accessibilityLabel={cta.label}
        disabled={cta.loading}
        onPress={cta.onPress}
        style={[
          styles.cta,
          { backgroundColor: colors.primary, opacity: cta.loading ? 0.7 : 1 },
        ]}
      >
        {cta.loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.ctaText, { fontFamily: typography.fontFamily }]}>
            {cta.label}
          </Text>
        )}
      </Pressable>

      {showCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          style={styles.cancel}
        >
          <Text
            style={[
              styles.cancelText,
              { color: colors.fgMuted, fontFamily: typography.fontFamily },
            ]}
          >
            Cancel
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  info: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
  },
  cta: {
    height: 52,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  cancel: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
