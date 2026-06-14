import { DevicesResponseSchema, type Device } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";
import { DEVICES_KEY } from "./use-playback-socket";

/**
 * The user's online Staccato Connect devices. Fetched once for first paint;
 * thereafter the playback WebSocket pushes `devices-updated` straight into this
 * same query cache (see {@link usePlaybackSocket}). The active device is the one
 * currently emitting audio.
 */
export function useDevices(): {
  devices: Device[];
  activeDevice: Device | null;
  activeDeviceName: string;
} {
  const query = useAuthedQuery(
    DEVICES_KEY,
    "/api/playback/devices",
    DevicesResponseSchema,
  );
  const devices = query.data ?? [];
  const activeDevice = devices.find((d) => d.isActive) ?? null;
  return {
    devices,
    activeDevice,
    activeDeviceName: activeDevice?.deviceName ?? "This device",
  };
}
