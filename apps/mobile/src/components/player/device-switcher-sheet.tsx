import { Colors, PlaybackSessionSchema, type Device } from "@staccato/shared";
import { Check, Globe, Smartphone, X } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAuthedMutation } from "@/hooks/use-authed-mutation";
import { useDevices } from "@/hooks/use-devices";
import { PLAYBACK_SESSION_KEY } from "@/hooks/use-playback-session";
import { EqualizerBars } from "./equalizer-bars";
import { PLAYER_EASING, SHEET_SLIDE_MS } from "./player-easing";

/** Translate distance to fully tuck the (content-sized) sheet off-screen. */
const OFFSCREEN = 600;
/** Sheet surface: design token oklch(0.15 0.008 240), approximated in sRGB. */
const SHEET_BACKGROUND = Colors.bg;
/**
 * Active-device states use Staccato's primary brand accent (orange), not the
 * album-art accent — the device switcher is chrome, kept brand-consistent.
 */
const ACCENT = Colors.primary;

interface DeviceSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  isPlaying: boolean;
}

/**
 * "Connect to a device" bottom sheet. Lists the user's online Staccato Connect
 * devices and switches audio output to the tapped one (PUT /devices/active). The
 * active device shows an equalizer + checkmark. Mirrors the QueueSheet slide /
 * backdrop pattern.
 */
export function DeviceSwitcherSheet({
  open,
  onClose,
  isPlaying,
}: DeviceSwitcherSheetProps) {
  const { devices, activeDeviceName } = useDevices();

  const setActiveDevice = useAuthedMutation<unknown, { deviceId: string }>(
    PLAYBACK_SESSION_KEY,
    (client, vars) =>
      client.put("/api/playback/devices/active", vars, PlaybackSessionSchema),
    // The playback WebSocket broadcasts the new active device + session into the
    // cache; a settle-time refetch would only race that push.
    { invalidateOnSettled: false },
  );

  const sheetY = useSharedValue(OFFSCREEN);
  const backdropOpacity = useSharedValue(0);
  useEffect(() => {
    sheetY.value = withTiming(open ? 0 : OFFSCREEN, {
      duration: SHEET_SLIDE_MS,
      easing: PLAYER_EASING,
    });
    backdropOpacity.value = withTiming(open ? 1 : 0, { duration: 300 });
  }, [open, sheetY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const onSelect = (device: Device) => {
    if (!device.isActive) {
      setActiveDevice.mutate({ deviceId: device.deviceId });
    }
    onClose();
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          testID="device-sheet-backdrop"
          accessibilityLabel="Close device switcher"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Connect to a device</Text>
            <Text style={styles.subtitle}>
              Listening on{" "}
              <Text style={[styles.subtitleDevice, { color: ACCENT }]}>
                {activeDeviceName}
              </Text>
            </Text>
          </View>
          <Pressable
            testID="device-sheet-close"
            accessibilityRole="button"
            accessibilityLabel="Close device switcher"
            onPress={onClose}
            style={styles.closeButton}
          >
            <X size={16} color="rgba(255,255,255,0.45)" strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.list}>
          {devices.map((device) => (
            <DeviceRow
              key={device.deviceId}
              device={device}
              isPlaying={isPlaying}
              onPress={() => onSelect(device)}
            />
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </Animated.View>
    </View>
  );
}

function DeviceRow({
  device,
  isPlaying,
  onPress,
}: {
  device: Device;
  isPlaying: boolean;
  onPress: () => void;
}) {
  const active = device.isActive;
  const Icon = device.deviceType === "web" ? Globe : Smartphone;
  return (
    <Pressable
      testID={`device-row-${device.deviceId}`}
      accessibilityRole="button"
      accessibilityLabel={`Play on ${device.deviceName}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.row, active && styles.rowActive]}
    >
      <View style={[styles.iconWell, active && styles.iconWellActive]}>
        <Icon
          size={20}
          color={active ? "#fff" : "rgba(255,255,255,0.5)"}
          strokeWidth={1.8}
        />
      </View>
      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={[styles.deviceName, active && styles.deviceNameActive]}
        >
          {device.deviceName}
        </Text>
        {active ? (
          <View style={styles.subRow}>
            <EqualizerBars playing={isPlaying} color={ACCENT} />
            <Text style={[styles.subActive, { color: ACCENT }]}>Playing</Text>
          </View>
        ) : (
          <Text style={styles.subIdle}>
            {device.deviceType === "web" ? "Web player" : "Mobile device"}
          </Text>
        )}
      </View>
      {active ? (
        <View style={[styles.checkBadge, { backgroundColor: ACCENT }]}>
          <Check size={11} color="rgba(0,0,0,0.75)" strokeWidth={2.4} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: SHEET_BACKGROUND,
    boxShadow: "0 -24px 64px rgba(0,0,0,0.7)",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: "#fff",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.45)",
    marginTop: 3,
  },
  subtitleDevice: {
    fontWeight: "600",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 2,
  },
  rowActive: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  iconWellActive: {
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
  },
  deviceNameActive: {
    color: "#fff",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1.5,
  },
  subActive: {
    fontSize: 11,
    fontWeight: "600",
  },
  subIdle: {
    fontSize: 11,
    fontWeight: "400",
    color: "rgba(255,255,255,0.38)",
    marginTop: 1.5,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSpacer: {
    height: 28,
  },
});
