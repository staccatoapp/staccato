import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@staccato/shared";
import {
  DeviceRegistry,
  computeActiveDeviceOnConnect,
  type DeviceConnection,
} from "./device-registry.js";
import { logger } from "../logger.js";

vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function conn(overrides: Partial<DeviceConnection> = {}): DeviceConnection {
  return {
    deviceId: "device-1",
    deviceName: "Phone",
    deviceType: "mobile",
    userId: "user-1",
    send: vi.fn(),
    ...overrides,
  };
}

const sampleMessage: ServerMessage = {
  type: "devices-updated",
  data: [],
};

describe("DeviceRegistry", () => {
  let registry: DeviceRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new DeviceRegistry();
  });

  it("registers a connection and reports it online", () => {
    registry.register(conn({ deviceId: "a" }));

    expect(registry.isOnline("user-1", "a")).toBe(true);
    expect(registry.isOnline("user-1", "b")).toBe(false);
    expect(registry.isOnline("other-user", "a")).toBe(false);
  });

  it("lists only the requested user's connections", () => {
    registry.register(conn({ userId: "user-1", deviceId: "a" }));
    registry.register(conn({ userId: "user-1", deviceId: "b" }));
    registry.register(conn({ userId: "user-2", deviceId: "c" }));

    const ids = registry.listForUser("user-1").map((c) => c.deviceId);
    expect(ids.sort()).toEqual(["a", "b"]);
    expect(registry.listForUser("unknown")).toEqual([]);
  });

  it("replaces the connection when the same device reconnects", () => {
    const first = conn({ deviceId: "a", send: vi.fn() });
    const second = conn({ deviceId: "a", send: vi.fn() });
    registry.register(first);
    registry.register(second);

    expect(registry.listForUser("user-1")).toHaveLength(1);
    registry.broadcast("user-1", sampleMessage);
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).toHaveBeenCalledWith(sampleMessage);
  });

  it("unregisters a connection", () => {
    const connId = registry.register(conn({ deviceId: "a" }));
    registry.unregister("user-1", "a", connId);

    expect(registry.isOnline("user-1", "a")).toBe(false);
    expect(registry.listForUser("user-1")).toEqual([]);
  });

  it("ignores a stale connection's unregister after a reconnect replaced it", () => {
    // SC-1: on a fast reconnect with the same deviceId, register(B) replaces
    // A; the old socket's delayed close must not evict the live new connection.
    const first = conn({ deviceId: "a", send: vi.fn() });
    const second = conn({ deviceId: "a", send: vi.fn() });
    const firstConnId = registry.register(first);
    registry.register(second);

    registry.unregister("user-1", "a", firstConnId);

    expect(registry.isOnline("user-1", "a")).toBe(true);
    registry.broadcast("user-1", sampleMessage);
    expect(second.send).toHaveBeenCalledWith(sampleMessage);
    expect(first.send).not.toHaveBeenCalled();
  });

  it("broadcasts to every connection of the user only", () => {
    const a = conn({ userId: "user-1", deviceId: "a", send: vi.fn() });
    const b = conn({ userId: "user-1", deviceId: "b", send: vi.fn() });
    const other = conn({ userId: "user-2", deviceId: "c", send: vi.fn() });
    registry.register(a);
    registry.register(b);
    registry.register(other);

    registry.broadcast("user-1", sampleMessage);

    expect(a.send).toHaveBeenCalledWith(sampleMessage);
    expect(b.send).toHaveBeenCalledWith(sampleMessage);
    expect(other.send).not.toHaveBeenCalled();
  });

  it("sends to a single targeted device only", () => {
    const a = conn({ deviceId: "a", send: vi.fn() });
    const b = conn({ deviceId: "b", send: vi.fn() });
    registry.register(a);
    registry.register(b);

    registry.sendTo("user-1", "b", sampleMessage);

    expect(b.send).toHaveBeenCalledWith(sampleMessage);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("is a no-op when the targeted device is offline", () => {
    registry.register(conn({ deviceId: "a", send: vi.fn() }));
    expect(() =>
      registry.sendTo("user-1", "ghost", sampleMessage),
    ).not.toThrow();
  });

  it("logs and continues when a connection's send throws", () => {
    const broken = conn({
      deviceId: "a",
      send: vi.fn(() => {
        throw new Error("socket closed");
      }),
    });
    const healthy = conn({ deviceId: "b", send: vi.fn() });
    registry.register(broken);
    registry.register(healthy);

    expect(() => registry.broadcast("user-1", sampleMessage)).not.toThrow();
    expect(healthy.send).toHaveBeenCalledWith(sampleMessage);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("computeActiveDeviceOnConnect", () => {
  it("claims when no device is active", () => {
    expect(
      computeActiveDeviceOnConnect({
        currentActiveDeviceId: null,
        connectingDeviceId: "me",
        isActiveOnline: false,
      }),
    ).toBe("me");
  });

  it("claims when the active device is offline", () => {
    expect(
      computeActiveDeviceOnConnect({
        currentActiveDeviceId: "ghost",
        connectingDeviceId: "me",
        isActiveOnline: false,
      }),
    ).toBe("me");
  });

  it("does not steal an active, online device", () => {
    expect(
      computeActiveDeviceOnConnect({
        currentActiveDeviceId: "other",
        connectingDeviceId: "me",
        isActiveOnline: true,
      }),
    ).toBe("other");
  });
});
