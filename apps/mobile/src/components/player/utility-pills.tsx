import { Cast, ListMusic, MicVocal } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface UtilityPillsProps {
  lyricsAvailable: boolean;
  lyricsActive: boolean;
  onToggleLyrics: () => void;
  onOpenQueue: () => void;
  onOpenDeviceSwitcher: () => void;
  /** Name of the device currently emitting audio (shown on the output pill). */
  activeDeviceName: string;
}

/**
 * Bottom utility strip: output device (Staccato Connect) · Lyrics toggle · Up
 * Next. Tapping the output pill opens the device switcher.
 */
export function UtilityPills({
  lyricsAvailable,
  lyricsActive,
  onToggleLyrics,
  onOpenQueue,
  onOpenDeviceSwitcher,
  activeDeviceName,
}: UtilityPillsProps) {
  return (
    <View style={styles.row}>
      <Pill
        testID="pill-output"
        icon={<Cast size={14} color={PILL_IDLE_TEXT} strokeWidth={2} />}
        label={activeDeviceName}
        onPress={onOpenDeviceSwitcher}
      />
      <Pill
        testID="pill-lyrics"
        icon={
          <MicVocal
            size={14}
            color={lyricsActive ? "#fff" : PILL_IDLE_TEXT}
            strokeWidth={2.2}
          />
        }
        label="Lyrics"
        active={lyricsActive}
        disabled={!lyricsAvailable}
        onPress={onToggleLyrics}
      />
      <Pill
        testID="pill-up-next"
        icon={<ListMusic size={14} color={PILL_IDLE_TEXT} strokeWidth={2.2} />}
        label="Up Next"
        onPress={onOpenQueue}
      />
    </View>
  );
}

const PILL_IDLE_TEXT = "rgba(255,255,255,0.85)";

interface PillProps {
  testID: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

function Pill({ testID, icon, label, active, disabled, onPress }: PillProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        active ? styles.pillActive : styles.pillIdle,
        disabled && styles.pillDisabled,
      ]}
    >
      {icon}
      <Text style={[styles.label, { color: active ? "#fff" : PILL_IDLE_TEXT }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  pillIdle: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
