import type { DeviceType, ServerMessage } from "@staccato/shared";
import { logger } from "../logger.js";

/**
 * A live Staccato Connect device connection (one open playback WebSocket).
 * `send` wraps the underlying socket write so the registry never imports ws.
 */
export interface DeviceConnection {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  userId: string;
  send: (message: ServerMessage) => void;
}

/** A registered connection plus the registry-assigned identity used to make
 *  eviction reconnect-safe (see {@link DeviceRegistry.unregister}). */
interface RegisteredConnection extends DeviceConnection {
  connId: number;
}

/**
 * In-memory presence registry for Staccato Connect. The server runs as a single
 * Node process (self-hosted), so connection state lives in memory — a device is
 * "online" iff it currently holds a live WebSocket connection here. Never
 * persisted; rebuilt from scratch on restart as clients reconnect.
 */
export class DeviceRegistry {
  // userId -> (deviceId -> connection)
  private readonly connections = new Map<
    string,
    Map<string, RegisteredConnection>
  >();

  /** Monotonic identity stamped on every registration. Lets `unregister`
   *  distinguish a freshly reconnected socket from the stale one it replaced. */
  private nextConnId = 1;

  /**
   * Register a live connection and return its identity token. A reconnect with
   * the same deviceId replaces the previous socket; the caller must hand the
   * returned `connId` back to {@link unregister} so a late close on the old
   * socket cannot evict the new one.
   */
  register(connection: DeviceConnection): number {
    let userConnections = this.connections.get(connection.userId);
    if (!userConnections) {
      userConnections = new Map();
      this.connections.set(connection.userId, userConnections);
    }
    const connId = this.nextConnId++;
    // Reconnect with the same deviceId replaces the previous socket.
    userConnections.set(connection.deviceId, { ...connection, connId });
    return connId;
  }

  /**
   * Remove a connection — but only if the currently-stored connection is the
   * same one that closed (matched by `connId`). On a fast reconnect the new
   * connection has already replaced the old in the map; the old socket's
   * delayed close must be a no-op so the live device stays online (SC-1).
   */
  unregister(userId: string, deviceId: string, connId: number): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;
    const existing = userConnections.get(deviceId);
    if (!existing || existing.connId !== connId) return;
    userConnections.delete(deviceId);
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }
  }

  isOnline(userId: string, deviceId: string): boolean {
    return this.connections.get(userId)?.has(deviceId) ?? false;
  }

  listForUser(userId: string): DeviceConnection[] {
    return Array.from(this.connections.get(userId)?.values() ?? []);
  }

  /**
   * Deliver a message to one specific device of a user (e.g. relaying a
   * transport command to the active device). No-op if that device is offline.
   */
  sendTo(userId: string, deviceId: string, message: ServerMessage): void {
    const connection = this.connections.get(userId)?.get(deviceId);
    if (!connection) return;
    try {
      connection.send(message);
    } catch (err) {
      logger.warn(
        { err, userId, deviceId, messageType: message.type },
        "failed to send playback message to device",
      );
    }
  }

  broadcast(userId: string, message: ServerMessage): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;
    for (const connection of userConnections.values()) {
      try {
        connection.send(message);
      } catch (err) {
        // A dead socket must not block delivery to the other devices.
        logger.warn(
          {
            err,
            userId,
            deviceId: connection.deviceId,
            messageType: message.type,
          },
          "failed to send playback message to device",
        );
      }
    }
  }
}

/**
 * Decide which device should own audio output when a client connects. A
 * connecting device claims the session when nobody is active or the active
 * device has gone offline; an active, online device is never stolen from.
 */
export function computeActiveDeviceOnConnect(params: {
  currentActiveDeviceId: string | null;
  connectingDeviceId: string;
  isActiveOnline: boolean;
}): string {
  const { currentActiveDeviceId, connectingDeviceId, isActiveOnline } = params;
  if (!currentActiveDeviceId || !isActiveOnline) {
    return connectingDeviceId;
  }
  return currentActiveDeviceId;
}

/** Process-wide singleton shared by every playback route. */
export const deviceRegistry = new DeviceRegistry();
