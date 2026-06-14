import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, StateReport } from "./protocol.js";
import {
  PlaybackController,
  type PlayerAdapter,
} from "./controller.js";
import type { PlaybackSession, PlaybackTrack } from "../types/zod/api/playback.js";

function track(id: string): PlaybackTrack {
  return {
    id,
    title: id,
    trackNumber: null,
    discNumber: null,
    artistName: null,
    albumTitle: null,
    coverArtUrl: null,
    durationSeconds: 200,
    artists: [],
  };
}

function session(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return {
    trackQueue: [track("t1"), track("t2")],
    currentTrackIndex: 0,
    currentTrackPositionInSeconds: 0,
    currentTrackAccumulatedPlayTimeInSeconds: 0,
    currentTrackListenEventCreated: false,
    isPlaying: false,
    activeDeviceId: null,
    ...overrides,
  };
}

class FakeAdapter implements PlayerAdapter {
  position = 0;
  duration: number | null = 200;
  loaded: string | null = null;
  load = vi.fn((id: string) => {
    this.loaded = id;
    this.position = 0;
  });
  play = vi.fn();
  pause = vi.fn();
  seek = vi.fn((s: number) => {
    this.position = s;
  });
  getPosition = vi.fn(() => this.position);
  getDuration = vi.fn(() => this.duration);
}

function setup() {
  const adapter = new FakeAdapter();
  const sent: ClientMessage[] = [];
  let nowMs = 1000;
  const controller = new PlaybackController({
    adapter,
    send: (m) => sent.push(m),
    now: () => nowMs,
  });
  const reports = () =>
    sent.filter((m) => m.type === "state-report").map((m) => m.data as StateReport);
  const commands = () => sent.filter((m) => m.type === "command");
  return {
    adapter,
    controller,
    sent,
    reports,
    commands,
    setNow: (v: number) => {
      nowMs = v;
    },
  };
}

describe("active/passive derivation", () => {
  it("is passive before the connected hello arrives", () => {
    const { controller } = setup();
    expect(controller.getViewState().isActiveDevice).toBe(false);
  });

  it("becomes active when the session names this device", () => {
    const { controller } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({ activeDeviceId: "A" }),
      serverTimeMs: 1000,
    });
    expect(controller.getViewState().isActiveDevice).toBe(true);
  });

  it("stays passive when another device is active", () => {
    const { controller } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({ activeDeviceId: "B" }),
      serverTimeMs: 1000,
    });
    expect(controller.getViewState().isActiveDevice).toBe(false);
  });
});

describe("becoming active", () => {
  it("loads the current track, restores position, and plays when the session is playing", () => {
    const { controller, adapter } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "A",
        isPlaying: true,
        currentTrackPositionInSeconds: 10,
      }),
      serverTimeMs: 1000,
    });
    expect(adapter.load).toHaveBeenCalledWith("t1");
    expect(adapter.seek).toHaveBeenCalledWith(10);
    expect(adapter.play).toHaveBeenCalled();
  });

  it("loads but stays paused when the session is paused", () => {
    const { controller, adapter } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({ activeDeviceId: "A", isPlaying: false }),
      serverTimeMs: 1000,
    });
    expect(adapter.load).toHaveBeenCalledWith("t1");
    expect(adapter.play).not.toHaveBeenCalled();
  });
});

function makeActive(playing = true, position = 0) {
  const ctx = setup();
  ctx.controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
  ctx.controller.onServerMessage({
    type: "session-updated",
    data: session({
      activeDeviceId: "A",
      isPlaying: playing,
      currentTrackPositionInSeconds: position,
    }),
    serverTimeMs: 1000,
  });
  return ctx;
}

describe("active device reporting", () => {
  it("reports position on heartbeat while playing, with a monotonic seq", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    adapter.position = 3;
    controller.heartbeat();
    adapter.position = 7;
    controller.heartbeat();
    const r = reports();
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ positionSeconds: 3, seq: 1, isPlaying: true });
    expect(r[1]).toMatchObject({ positionSeconds: 7, seq: 2 });
  });

  it("does not report on heartbeat when paused", () => {
    const { controller, reports } = makeActive(false, 0);
    controller.heartbeat();
    expect(reports()).toHaveLength(0);
  });

  it("advances the accumulator only by genuine playback deltas", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    adapter.position = 4; // +4 genuine
    controller.heartbeat();
    adapter.position = 2; // backwards seek -> +0
    controller.heartbeat();
    adapter.position = 50; // forward jump >5 -> +0
    controller.heartbeat();
    expect(reports().at(-1)?.accumulatedPlayTimeSeconds).toBe(4);
  });
});

describe("report precision (SC-10)", () => {
  it("reports accumulated unfloored so a fractional threshold crossing isn't dropped", () => {
    // Flooring accumulated meant a long track needed >241s to cross the server's
    // >240 gate; a fractional value just over threshold must be preserved.
    const { controller, adapter, reports } = makeActive(true, 0);
    adapter.position = 0.5;
    controller.heartbeat();
    expect(reports().at(-1)?.accumulatedPlayTimeSeconds).toBeCloseTo(0.5);
  });

  it("rounds the reported position rather than flooring it", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    adapter.position = 7.8;
    controller.heartbeat();
    expect(reports().at(-1)?.positionSeconds).toBe(8);
  });
});

describe("active device commands (local UI, applied immediately)", () => {
  it("pauses the local player and reports, without relaying", () => {
    const { controller, adapter, reports, commands } = makeActive(true, 20);
    adapter.position = 20;
    controller.command({ kind: "setPlaying", value: false });
    expect(adapter.pause).toHaveBeenCalled();
    expect(commands()).toHaveLength(0);
    expect(reports().at(-1)).toMatchObject({ isPlaying: false, positionSeconds: 20 });
  });

  it("seeks the local player and reports the new position", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    controller.command({ kind: "seek", positionSeconds: 42 });
    expect(adapter.seek).toHaveBeenCalledWith(42);
    expect(reports().at(-1)).toMatchObject({ positionSeconds: 42 });
  });

  it("advances the queue on next", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    controller.command({ kind: "next" });
    expect(adapter.load).toHaveBeenCalledWith("t2");
    expect(reports().at(-1)).toMatchObject({
      currentTrackIndex: 1,
      positionSeconds: 0,
      isPlaying: true,
    });
  });
});

describe("relayed commands (server -> active device)", () => {
  it("executes a relayed seek on the active device", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    controller.onServerMessage({
      type: "command",
      data: { kind: "seek", positionSeconds: 99 },
    });
    expect(adapter.seek).toHaveBeenCalledWith(99);
    expect(reports().at(-1)).toMatchObject({ positionSeconds: 99 });
  });
});

describe("passive device commands (optimistic + relay)", () => {
  function makePassive() {
    const ctx = setup();
    ctx.controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    ctx.controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "B",
        isPlaying: true,
        currentTrackPositionInSeconds: 20,
      }),
      serverTimeMs: 5000,
    });
    return ctx;
  }

  it("relays the command and never touches its own player", () => {
    const { controller, adapter, commands } = makePassive();
    controller.command({ kind: "setPlaying", value: false });
    expect(commands()).toHaveLength(1);
    expect(commands()[0]).toEqual({
      type: "command",
      data: { kind: "setPlaying", value: false },
    });
    expect(adapter.play).not.toHaveBeenCalled();
  });

  it("optimistically reflects a pause in the view, then reconciles to the broadcast", () => {
    const { controller } = makePassive();
    controller.command({ kind: "setPlaying", value: false });
    expect(controller.getViewState().isPlaying).toBe(false);
    // authoritative broadcast says it is still playing -> reconcile
    controller.onServerMessage({
      type: "session-updated",
      data: session({ activeDeviceId: "B", isPlaying: true }),
      serverTimeMs: 6000,
    });
    expect(controller.getViewState().isPlaying).toBe(true);
  });

  it("optimistically reflects a seek in the displayed position", () => {
    const { controller } = makePassive();
    controller.command({ kind: "seek", positionSeconds: 120 });
    expect(controller.getViewState().displayPositionSeconds).toBeCloseTo(120);
  });
});

describe("passive interpolation (offset-corrected, clock-skew free)", () => {
  it("advances the displayed position by wall-clock seconds while playing", () => {
    const { controller, setNow } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    // server clock is 4000ms ahead of local; position 20 at the broadcast.
    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "B",
        isPlaying: true,
        currentTrackPositionInSeconds: 20,
      }),
      serverTimeMs: 5000,
    });
    expect(controller.getViewState().displayPositionSeconds).toBeCloseTo(20);
    setNow(3000); // 2s of local wall-clock later
    expect(controller.getViewState().displayPositionSeconds).toBeCloseTo(22);
  });

  it("freezes the displayed position while paused", () => {
    const { controller, setNow } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "B",
        isPlaying: false,
        currentTrackPositionInSeconds: 20,
      }),
      serverTimeMs: 5000,
    });
    setNow(9000);
    expect(controller.getViewState().displayPositionSeconds).toBeCloseTo(20);
  });

  it("clamps the displayed position to the track duration", () => {
    const { controller, setNow } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "B",
        isPlaying: true,
        currentTrackPositionInSeconds: 195,
      }),
      serverTimeMs: 1000,
    });
    setNow(100000);
    expect(controller.getViewState().displayPositionSeconds).toBe(200);
  });
});

describe("handoff", () => {
  it("on yield: pauses, flushes one final report at the true position, goes passive", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    adapter.position = 77;
    controller.onServerMessage({ type: "yield", data: { reason: "handoff" } });
    expect(adapter.pause).toHaveBeenCalled();
    const r = reports();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ positionSeconds: 77, isPlaying: true });
    expect(controller.getViewState().isActiveDevice).toBe(false);
  });

  it("on yield: reports the intended (overlay) play state, not the stale session state", () => {
    // SC-3: a setPlaying:false is optimistically applied (overlay) but the
    // session-acked isPlaying is still true when yield arrives. The flush must
    // report the user's intent (paused) so the incoming device doesn't resume.
    const { controller, adapter, reports } = makeActive(true, 0);
    controller.command({ kind: "setPlaying", value: false });
    adapter.position = 40;
    controller.onServerMessage({ type: "yield", data: { reason: "handoff" } });
    expect(reports().at(-1)).toMatchObject({
      isPlaying: false,
      positionSeconds: 40,
    });
  });

  it("on assume-active: pre-warms the track but waits to resume until the authoritative broadcast", () => {
    const { controller, adapter } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "session-updated",
      data: session({ activeDeviceId: "B" }),
      serverTimeMs: 1000,
    });
    controller.onServerMessage({
      type: "assume-active",
      data: { trackId: "t2", positionSeconds: 55, isPlaying: true },
    });
    expect(adapter.load).toHaveBeenCalledWith("t2");
    expect(adapter.seek).toHaveBeenCalledWith(55);
    expect(adapter.play).not.toHaveBeenCalled();
    expect(adapter.load).toHaveBeenCalledTimes(1);

    // authoritative resume arrives
    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "A",
        currentTrackIndex: 1,
        isPlaying: true,
        currentTrackPositionInSeconds: 55,
      }),
      serverTimeMs: 2000,
    });
    expect(adapter.play).toHaveBeenCalled();
    expect(adapter.load).toHaveBeenCalledTimes(1); // no redundant reload
  });
});

describe("same-track server reset (SC-5)", () => {
  function makeActiveWith(position: number, accumulated: number) {
    const ctx = setup();
    ctx.controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    ctx.controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "A",
        isPlaying: true,
        currentTrackPositionInSeconds: position,
        currentTrackAccumulatedPlayTimeInSeconds: accumulated,
      }),
      serverTimeMs: 1000,
    });
    return ctx;
  }

  it("restarts the track and drops the stale accumulator on a same-track replay", () => {
    // The active device has been listening: position 150, accumulated 150 (above
    // the dur/2 = 100 scrobble threshold). The server replays the current track
    // (PUT /session/play resets position + accumulated to 0). The controller must
    // restart locally and reset its accumulator so the next report doesn't re-trip
    // the (re-armed) scrobble gate.
    const { controller, adapter, reports } = makeActiveWith(150, 150);
    adapter.seek.mockClear();

    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "A",
        isPlaying: true,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: 0,
      }),
      serverTimeMs: 2000,
    });

    expect(adapter.seek).toHaveBeenCalledWith(0);
    controller.heartbeat();
    expect(reports().at(-1)?.accumulatedPlayTimeSeconds).toBe(0);
  });

  it("does not resync during steady-state playback (server slightly behind)", () => {
    // The server's echoed position/accumulated are normally a touch behind the
    // active device's live values (floor + lag); that must not trigger a resync.
    const { controller, adapter } = makeActiveWith(150, 150);
    adapter.seek.mockClear();
    adapter.position = 152;

    controller.onServerMessage({
      type: "session-updated",
      data: session({
        activeDeviceId: "A",
        isPlaying: true,
        currentTrackPositionInSeconds: 149,
        currentTrackAccumulatedPlayTimeInSeconds: 149,
      }),
      serverTimeMs: 2000,
    });

    expect(adapter.seek).not.toHaveBeenCalled();
  });
});

describe("empty-queue handoff (SC-6)", () => {
  it("clears awaitingResume on a trackId:null takeover so seq stays monotonic", () => {
    // The device is pre-warmed for an empty queue (assume-active trackId:null),
    // then takes over while the queue is still empty. awaitingResume must clear
    // anyway — otherwise every later session-updated would re-takeover and reset
    // seq to 0, getting the device's reports dropped by the server's seq guard.
    const { controller, adapter, reports } = setup();
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    controller.onServerMessage({
      type: "assume-active",
      data: { trackId: null, positionSeconds: 0, isPlaying: true },
    });
    const empty = () =>
      session({ trackQueue: [], activeDeviceId: "A", isPlaying: true });

    controller.onServerMessage({
      type: "session-updated",
      data: empty(),
      serverTimeMs: 2000,
    });
    adapter.position = 1;
    controller.heartbeat();
    controller.onServerMessage({
      type: "session-updated",
      data: empty(),
      serverTimeMs: 3000,
    });
    adapter.position = 2;
    controller.heartbeat();

    expect(reports().map((r) => r.seq)).toEqual([1, 2]);
  });
});

describe("queue end / external transport", () => {
  it("advances on track end (active device)", () => {
    const { controller, adapter, reports } = makeActive(true, 0);
    controller.onEnded();
    expect(adapter.load).toHaveBeenCalledWith("t2");
    expect(reports().at(-1)).toMatchObject({ currentTrackIndex: 1 });
  });

  it("reports an external (lock-screen) pause", () => {
    const { controller, reports } = makeActive(true, 30);
    controller.onExternalPlayPause(false);
    expect(reports().at(-1)).toMatchObject({ isPlaying: false });
  });
});

describe("subscribe", () => {
  it("notifies subscribers on state changes", () => {
    const { controller } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.onServerMessage({ type: "connected", data: { deviceId: "A" } });
    expect(listener).toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
