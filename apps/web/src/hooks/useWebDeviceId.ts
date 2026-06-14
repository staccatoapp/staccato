const DEVICE_ID_KEY = "staccato.webDeviceId";

/** A friendly name for this browser, derived from the user agent. */
function deriveDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} (Web)`;
}

/**
 * A stable per-browser Staccato Connect identity. Web sessions authenticate with
 * a cookie and carry no token, so we mint a UUID once and keep it in
 * localStorage; it is shared across this browser's tabs (intentional — the whole
 * browser is one "web" device). Sent to the server on the WebSocket handshake.
 */
export function useWebDeviceId(): { deviceId: string; deviceName: string } {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return { deviceId, deviceName: deriveDeviceName() };
}
