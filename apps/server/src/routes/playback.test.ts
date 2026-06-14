import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { ClientMessage, ServerMessage } from "@staccato/shared";
import playbackRoutes, {
  isCrossOriginWebSocket,
  handleClientMessage,
  handleDeviceConnect,
  handleDeviceDisconnect,
  __resetConnectState,
} from "./playback.js";
import { buildApp } from "./__fixtures__/app.js";
import {
  getOrCreatePlaybackSession,
  updatePlaybackSession,
  type PlaybackSessionRow,
} from "../db/queries/playback-session.js";
import { getPlaybackTracksByIds } from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import {
  deviceRegistry,
  computeActiveDeviceOnConnect,
} from "../playback/device-registry.js";

vi.mock("../db/queries/playback-session.js");
vi.mock("../db/queries/tracks.js");
vi.mock("../db/queries/track-artists.js");
vi.mock("../db/queries/listening-history.js");
vi.mock("../db/queries/settings.js");
vi.mock("../listenbrainz/client.js");
vi.mock("../db/queries/track-lyrics.js");
vi.mock("../lyrics/client.js");
vi.mock("../coverart/store.js");
vi.mock("../scrobbling/dispatch.js", () => ({
  recordListen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../playback/device-registry.js", () => ({
  deviceRegistry: {
    register: vi.fn(),
    unregister: vi.fn(),
    isOnline: vi.fn(),
    listForUser: vi.fn(() => []),
    broadcast: vi.fn(),
    sendTo: vi.fn(),
  },
  computeActiveDeviceOnConnect: vi.fn(),
}));

const log = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

function fakeSession(
  overrides: Partial<PlaybackSessionRow> = {},
): PlaybackSessionRow {
  return {
    id: "ps-1",
    userId: "user-1",
    playbackSourceId: null,
    trackQueue: ["t1"],
    currentTrackIndex: 0,
    currentTrackPositionInSeconds: 0,
    currentTrackAccumulatedPlayTimeInSeconds: 0,
    currentTrackListenEventCreated: false,
    isPlaying: false,
    activeDeviceId: null,
    playbackUpdatedAtMs: 0,
    stateSeq: 0,
    ...overrides,
  };
}

function mockTrackResolution() {
  vi.mocked(getPlaybackTracksByIds).mockReturnValue([
    {
      id: "t1",
      title: "Dreams",
      trackNumber: 2,
      discNumber: 1,
      artistName: "Fleetwood Mac",
      albumId: "a1",
      albumTitle: "Rumours",
      releaseGroupMbid: null,
      coverArtUrl: null,
      durationSeconds: 254,
    },
  ]);
  vi.mocked(listTrackArtistsForTracks).mockReturnValue([]);
  vi.mocked(groupCreditsByTrack).mockReturnValue(new Map());
  vi.mocked(resolveAlbumCoverNow).mockReturnValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectState();
});

describe("GET /session", () => {
  it("includes albumTitle and activeDeviceId on the response", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "device-1" }),
    );
    mockTrackResolution();

    const app = buildApp(playbackRoutes);
    const res = await app.inject({ method: "GET", url: "/session" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trackQueue).toHaveLength(1);
    expect(body.trackQueue[0].albumTitle).toBe("Rumours");
    expect(body.activeDeviceId).toBe("device-1");
  });
});

describe("POST /session/queue", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/session/queue",
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /session/queue", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/session/queue",
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("handleClientMessage: state-report", () => {
  function report(overrides: Partial<ClientMessage & { data: object }> = {}) {
    return {
      type: "state-report",
      data: {
        isPlaying: true,
        currentTrackIndex: 0,
        positionSeconds: 10,
        accumulatedPlayTimeSeconds: 10,
        seq: 1,
        ...(overrides as { data?: object }).data,
      },
    } as ClientMessage;
  }

  it("persists and broadcasts a report from the active device", () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", stateSeq: 0 }),
    );
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1" }),
    );
    mockTrackResolution();

    handleClientMessage({ userId: "user-1", deviceId: "d1", log }, report());

    expect(updatePlaybackSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        currentTrackPositionInSeconds: 10,
        stateSeq: 1,
        playbackUpdatedAtMs: expect.any(Number),
      }),
    );
    expect(deviceRegistry.broadcast).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ type: "session-updated" }),
    );
  });

  it("drops a report from a non-active device (single-writer rule)", () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1" }),
    );

    handleClientMessage({ userId: "user-1", deviceId: "d2", log }, report());

    expect(updatePlaybackSession).not.toHaveBeenCalled();
    expect(deviceRegistry.broadcast).not.toHaveBeenCalled();
  });

  it("drops a stale report whose seq is not greater than the stored seq", () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", stateSeq: 5 }),
    );

    handleClientMessage(
      { userId: "user-1", deviceId: "d1", log },
      report({ data: { seq: 5 } } as never),
    );

    expect(updatePlaybackSession).not.toHaveBeenCalled();
  });
});

describe("handleClientMessage: command", () => {
  const seekCmd = {
    type: "command",
    data: { kind: "seek", positionSeconds: 42 },
  } as ClientMessage;

  it("relays the command to the active device when one is online", () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1" }),
    );
    vi.mocked(deviceRegistry.isOnline).mockReturnValue(true);

    handleClientMessage({ userId: "user-1", deviceId: "d2", log }, seekCmd);

    expect(deviceRegistry.sendTo).toHaveBeenCalledWith(
      "user-1",
      "d1",
      expect.objectContaining({ type: "command" }),
    );
    expect(updatePlaybackSession).not.toHaveBeenCalled();
  });

  it("applies the command to the durable row when no device is active", () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: null }),
    );
    vi.mocked(updatePlaybackSession).mockReturnValue(fakeSession());
    mockTrackResolution();

    handleClientMessage({ userId: "user-1", deviceId: "d2", log }, seekCmd);

    expect(updatePlaybackSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ currentTrackPositionInSeconds: 42 }),
    );
    expect(deviceRegistry.broadcast).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ type: "session-updated" }),
    );
  });
});

describe("PUT /session/play", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { notValid: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("active-device reclaim on reconnect (SC-2)", () => {
  const send = vi.fn();

  it("preserves isPlaying when the prior active device reconnects", () => {
    mockTrackResolution();
    // d1 is the active, playing device and its socket drops.
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", isPlaying: true }),
    );
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: null, isPlaying: true }),
    );
    handleDeviceDisconnect({
      userId: "user-1",
      deviceId: "d1",
      connId: 1,
      log,
    });

    // d1 reconnects: the pointer was released, but it is the prior owner so it
    // must reclaim without a forced pause.
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: null, isPlaying: true }),
    );
    vi.mocked(computeActiveDeviceOnConnect).mockReturnValue("d1");
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", isPlaying: true }),
    );
    handleDeviceConnect(
      {
        userId: "user-1",
        deviceId: "d1",
        deviceName: "Phone",
        deviceType: "mobile",
        log,
      },
      send,
    );

    const connectUpdate = vi.mocked(updatePlaybackSession).mock.calls.at(-1);
    expect(connectUpdate?.[1]).toMatchObject({
      activeDeviceId: "d1",
      stateSeq: 0,
    });
    expect(connectUpdate?.[1]).not.toHaveProperty("isPlaying");
  });

  it("forces paused when a different device claims an orphaned session", () => {
    mockTrackResolution();
    // No prior owner recorded; d2 connects to a session whose owner d1 is gone.
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", isPlaying: true }),
    );
    vi.mocked(computeActiveDeviceOnConnect).mockReturnValue("d2");
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d2", isPlaying: false }),
    );

    handleDeviceConnect(
      {
        userId: "user-1",
        deviceId: "d2",
        deviceName: "Web player",
        deviceType: "web",
        log,
      },
      send,
    );

    expect(updatePlaybackSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ activeDeviceId: "d2", isPlaying: false }),
    );
  });
});

describe("auto-claim broadcast (SC-9)", () => {
  it("delivers session-updated to the connecting device exactly once on auto-claim", () => {
    mockTrackResolution();
    // Wire the registry mock so a broadcast actually fans back to the connecting
    // socket (as it does live): register captures the send, broadcast replays it.
    let registeredSend: ((m: ServerMessage) => void) | undefined;
    vi.mocked(deviceRegistry.register).mockImplementation(
      (c: { send: (m: ServerMessage) => void }) => {
        registeredSend = c.send;
        return 1;
      },
    );
    vi.mocked(deviceRegistry.broadcast).mockImplementation(
      (_userId: string, msg: ServerMessage) => {
        registeredSend?.(msg);
      },
    );
    // Unowned session → the connecting device auto-claims (activeChanged).
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: null }),
    );
    vi.mocked(computeActiveDeviceOnConnect).mockReturnValue("d1");
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1" }),
    );

    const send = vi.fn();
    handleDeviceConnect(
      {
        userId: "user-1",
        deviceId: "d1",
        deviceName: "Phone",
        deviceType: "mobile",
        log,
      },
      send,
    );

    const sessionUpdates = send.mock.calls.filter(
      ([m]) => (m as ServerMessage).type === "session-updated",
    );
    expect(sessionUpdates).toHaveLength(1);
  });
});

describe("GET /devices", () => {
  it("lists connected devices, flagging the active one", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1" }),
    );
    vi.mocked(deviceRegistry.listForUser).mockReturnValue([
      {
        deviceId: "d1",
        deviceName: "Phone",
        deviceType: "mobile",
        userId: "user-1",
        send: vi.fn(),
      },
      {
        deviceId: "d2",
        deviceName: "Web player",
        deviceType: "web",
        userId: "user-1",
        send: vi.fn(),
      },
    ]);

    const app = buildApp(playbackRoutes);
    const res = await app.inject({ method: "GET", url: "/devices" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual([
      {
        deviceId: "d1",
        deviceName: "Phone",
        deviceType: "mobile",
        isActive: true,
      },
      {
        deviceId: "d2",
        deviceName: "Web player",
        deviceType: "web",
        isActive: false,
      },
    ]);
  });
});

describe("PUT /devices/active", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/devices/active",
      payload: { notDeviceId: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the target device is not online", async () => {
    vi.mocked(deviceRegistry.isOnline).mockReturnValue(false);
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(fakeSession());

    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/devices/active",
      payload: { deviceId: "ghost" },
    });

    expect(res.statusCode).toBe(404);
    expect(updatePlaybackSession).not.toHaveBeenCalled();
  });

  it("switches immediately when there is no online outgoing device", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: null }),
    );
    vi.mocked(deviceRegistry.isOnline).mockImplementation(
      (_u: string, id: string) => id === "d2",
    );
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d2" }),
    );
    vi.mocked(deviceRegistry.listForUser).mockReturnValue([]);
    mockTrackResolution();

    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/devices/active",
      payload: { deviceId: "d2" },
    });

    expect(res.statusCode).toBe(200);
    expect(updatePlaybackSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ activeDeviceId: "d2", stateSeq: 0 }),
    );
    expect(deviceRegistry.broadcast).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ type: "devices-updated" }),
    );
  });

  it("defers the switch and orchestrates a handoff when the outgoing device is online", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", isPlaying: true }),
    );
    vi.mocked(deviceRegistry.isOnline).mockReturnValue(true);
    mockTrackResolution();

    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/devices/active",
      payload: { deviceId: "d2" },
    });

    expect(res.statusCode).toBe(200);
    // The outgoing device is told to yield; the incoming device pre-warms.
    expect(deviceRegistry.sendTo).toHaveBeenCalledWith(
      "user-1",
      "d1",
      expect.objectContaining({ type: "yield" }),
    );
    expect(deviceRegistry.sendTo).toHaveBeenCalledWith(
      "user-1",
      "d2",
      expect.objectContaining({ type: "assume-active" }),
    );
    // The active pointer is NOT flipped yet — it switches on the flush report.
    expect(updatePlaybackSession).not.toHaveBeenCalled();
  });

  it("completes a pending handoff when the outgoing device's flush report arrives", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d1", isPlaying: true }),
    );
    vi.mocked(deviceRegistry.isOnline).mockReturnValue(true);
    vi.mocked(updatePlaybackSession).mockReturnValue(
      fakeSession({ activeDeviceId: "d2" }),
    );
    mockTrackResolution();

    const app = buildApp(playbackRoutes);
    await app.inject({
      method: "PUT",
      url: "/devices/active",
      payload: { deviceId: "d2" },
    });

    // The outgoing device flushes its final position.
    handleClientMessage(
      { userId: "user-1", deviceId: "d1", log },
      {
        type: "state-report",
        data: {
          isPlaying: true,
          currentTrackIndex: 0,
          positionSeconds: 77,
          accumulatedPlayTimeSeconds: 50,
          seq: 9,
        },
      },
    );

    expect(updatePlaybackSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ activeDeviceId: "d2", stateSeq: 0 }),
    );
  });
});

describe("isCrossOriginWebSocket (CSWSH guard)", () => {
  // `host` is the Fastify-resolved request host (from X-Forwarded-Host when
  // trustProxy is on, else the raw Host); `rawHost` is the raw Host header that
  // a proxy may rewrite to an internal upstream name.
  const req = (origin: string | undefined, host: string, rawHost?: string) =>
    ({ headers: { origin, host: rawHost }, host }) as never;

  it("treats a same-origin handshake as not cross-origin", () => {
    expect(
      isCrossOriginWebSocket(req("https://music.home.arpa", "music.home.arpa")),
    ).toBe(false);
  });

  it("flags a different origin host as cross-origin", () => {
    expect(
      isCrossOriginWebSocket(req("https://evil.example", "music.home.arpa")),
    ).toBe(true);
  });

  it("flags a missing Origin header as cross-origin", () => {
    expect(isCrossOriginWebSocket(req(undefined, "music.home.arpa"))).toBe(
      true,
    );
  });

  it("flags a malformed Origin as cross-origin", () => {
    expect(isCrossOriginWebSocket(req("not a url", "music.home.arpa"))).toBe(
      true,
    );
  });

  it("compares against the resolved host, not the raw upstream Host (proxy)", () => {
    // SC-4: behind a reverse proxy the raw Host is an internal name while the
    // browser Origin is the external URL; comparing the resolved host (derived
    // from X-Forwarded-Host) keeps the legitimate web client connected.
    expect(
      isCrossOriginWebSocket(
        req(
          "https://music.example.com",
          "music.example.com",
          "internal-upstream:3000",
        ),
      ),
    ).toBe(false);
  });
});

describe("GET /lyrics", () => {
  it("returns 400 when trackId query param is missing", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/lyrics",
    });
    expect(res.statusCode).toBe(400);
  });
});
