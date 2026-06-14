import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import type { ClientMessage } from "@staccato/shared";

import { DEVICES_KEY, usePlaybackSocket } from "./use-playback-socket";
import { PLAYBACK_SESSION_KEY } from "./use-playback-session";

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

// Minimal controllable WebSocket stand-in (RN/global WebSocket isn't available
// in the jest env). Captures handlers so the test can drive messages/closes.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  close = jest.fn();
  send = jest.fn();
  constructor(
    public url: string,
    public protocols: unknown,
    public options: unknown,
  ) {
    FakeWebSocket.instances.push(this);
  }
  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const SERVER = "https://music.home.arpa";

let queryClient: QueryClient;
const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  queryClient = new QueryClient();
  mockUseSession.mockReturnValue({
    session: { serverUrl: SERVER, token: "tok" },
  });
});

afterEach(() => {
  jest.useRealTimers();
  queryClient.clear();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("usePlaybackSocket", () => {
  it("connects with the bearer header to the ws:// endpoint", () => {
    renderHook(() => usePlaybackSocket(noop), { wrapper });

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("wss://music.home.arpa/api/playback/ws");
    expect(ws.options).toEqual({ headers: { Authorization: "Bearer tok" } });
  });

  it("forwards parsed server messages to the callback", () => {
    const onMessage = jest.fn();
    renderHook(() => usePlaybackSocket(onMessage), { wrapper });

    act(() =>
      FakeWebSocket.instances[0].emit({
        type: "connected",
        data: { deviceId: "dev-9" },
      }),
    );

    expect(onMessage).toHaveBeenCalledWith({
      type: "connected",
      data: { deviceId: "dev-9" },
    });
  });

  it("writes session-updated messages into the playback-session cache", () => {
    renderHook(() => usePlaybackSocket(noop), { wrapper });
    const session = {
      trackQueue: [],
      currentTrackIndex: 0,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
      isPlaying: true,
      activeDeviceId: "dev-9",
    };

    act(() =>
      FakeWebSocket.instances[0].emit({
        type: "session-updated",
        data: session,
        serverTimeMs: 1000,
      }),
    );

    expect(queryClient.getQueryData([...PLAYBACK_SESSION_KEY, SERVER])).toEqual(
      session,
    );
  });

  it("writes devices-updated messages into the devices cache", () => {
    renderHook(() => usePlaybackSocket(noop), { wrapper });
    const devices = [
      {
        deviceId: "dev-9",
        deviceName: "Phone",
        deviceType: "mobile",
        isActive: true,
      },
    ];

    act(() =>
      FakeWebSocket.instances[0].emit({
        type: "devices-updated",
        data: devices,
      }),
    );

    expect(queryClient.getQueryData([...DEVICES_KEY, SERVER])).toEqual(devices);
  });

  it("sends client messages over the socket", () => {
    const { result } = renderHook(() => usePlaybackSocket(noop), { wrapper });
    const message: ClientMessage = { type: "command", data: { kind: "next" } };
    act(() => result.current.send(message));
    expect(FakeWebSocket.instances[0].send).toHaveBeenCalledWith(
      JSON.stringify(message),
    );
  });

  it("reconnects after the socket closes", () => {
    renderHook(() => usePlaybackSocket(noop), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => FakeWebSocket.instances[0].onclose?.());
    act(() => jest.advanceTimersByTime(30_000));

    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
  });

  it("does not connect without a session", () => {
    mockUseSession.mockReturnValue({ session: null });
    renderHook(() => usePlaybackSocket(noop), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
