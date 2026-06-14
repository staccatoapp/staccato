import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ClientMessageSchema,
  ServerMessageSchema,
  TransportCommandSchema,
} from "./protocol.js";

const SESSION = {
  trackQueue: [],
  currentTrackIndex: 0,
  currentTrackPositionInSeconds: 12,
  currentTrackAccumulatedPlayTimeInSeconds: 12,
  currentTrackListenEventCreated: false,
  isPlaying: true,
  activeDeviceId: "dev-1",
};

describe("TransportCommandSchema", () => {
  it("parses each command kind", () => {
    expect(TransportCommandSchema.parse({ kind: "setPlaying", value: false })).toEqual({
      kind: "setPlaying",
      value: false,
    });
    expect(
      TransportCommandSchema.parse({ kind: "seek", positionSeconds: 42 }),
    ).toEqual({ kind: "seek", positionSeconds: 42 });
    expect(TransportCommandSchema.parse({ kind: "next" })).toEqual({ kind: "next" });
    expect(TransportCommandSchema.parse({ kind: "prev" })).toEqual({ kind: "prev" });
    expect(
      TransportCommandSchema.parse({ kind: "jumpToIndex", index: 3 }),
    ).toEqual({ kind: "jumpToIndex", index: 3 });
  });

  it("rejects an unknown command kind", () => {
    expect(() => TransportCommandSchema.parse({ kind: "stop" })).toThrow(
      z.ZodError,
    );
  });

  it("rejects setPlaying without a value", () => {
    expect(() => TransportCommandSchema.parse({ kind: "setPlaying" })).toThrow(
      z.ZodError,
    );
  });
});

describe("ClientMessageSchema", () => {
  it("parses a state-report", () => {
    const msg = {
      type: "state-report",
      data: {
        isPlaying: true,
        currentTrackIndex: 0,
        positionSeconds: 30,
        accumulatedPlayTimeSeconds: 28,
        seq: 5,
      },
    };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a state-report with the optional listenEventCreated flag", () => {
    const msg = {
      type: "state-report",
      data: {
        isPlaying: false,
        currentTrackIndex: 1,
        positionSeconds: 0,
        accumulatedPlayTimeSeconds: 0,
        currentTrackListenEventCreated: true,
        seq: 9,
      },
    };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a relayed command message", () => {
    const msg = { type: "command", data: { kind: "seek", positionSeconds: 7 } };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects a state-report missing seq", () => {
    expect(() =>
      ClientMessageSchema.parse({
        type: "state-report",
        data: {
          isPlaying: true,
          currentTrackIndex: 0,
          positionSeconds: 1,
          accumulatedPlayTimeSeconds: 1,
        },
      }),
    ).toThrow(z.ZodError);
  });
});

describe("ServerMessageSchema", () => {
  it("parses a connected hello", () => {
    const msg = { type: "connected", data: { deviceId: "dev-1" } };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a session-updated with serverTimeMs", () => {
    const msg = { type: "session-updated", data: SESSION, serverTimeMs: 1700 };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects a session-updated missing serverTimeMs", () => {
    expect(() =>
      ServerMessageSchema.parse({ type: "session-updated", data: SESSION }),
    ).toThrow(z.ZodError);
  });

  it("parses a devices-updated", () => {
    const msg = {
      type: "devices-updated",
      data: [
        {
          deviceId: "dev-1",
          deviceName: "Web player",
          deviceType: "web",
          isActive: true,
        },
      ],
    };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a relayed command", () => {
    const msg = {
      type: "command",
      data: { kind: "setPlaying", value: true },
    };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a yield", () => {
    const msg = { type: "yield", data: { reason: "handoff" } };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses an assume-active with prewarm data", () => {
    const msg = {
      type: "assume-active",
      data: { trackId: "t1", positionSeconds: 55, isPlaying: true },
    };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("accepts a null trackId on assume-active (empty queue)", () => {
    const msg = {
      type: "assume-active",
      data: { trackId: null, positionSeconds: 0, isPlaying: false },
    };
    expect(ServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects an unknown message type", () => {
    expect(() => ServerMessageSchema.parse({ type: "ping", data: {} })).toThrow(
      z.ZodError,
    );
  });
});
