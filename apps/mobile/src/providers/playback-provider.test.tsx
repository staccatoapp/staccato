import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import type { PlaybackSession, ServerMessage } from "@staccato/shared";

import { createApiClient, type ApiClient } from "@/lib/api-client";
import { PlaybackProvider, usePlayback } from "./playback-provider";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

// Capture the controller's onServerMessage callback + a send spy so tests can
// drive the provider exactly as the live socket would.
const mockSend = jest.fn();
const mockHolder: { onMessage?: (m: ServerMessage) => void } = {};
jest.mock("@/hooks/use-playback-socket", () => ({
  usePlaybackSocket: (onMessage: (m: ServerMessage) => void) => {
    mockHolder.onMessage = onMessage;
    return { send: mockSend };
  },
  DEVICES_KEY: ["devices"],
}));

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  replace: jest.fn(),
  setActiveForLockScreen: jest.fn(),
  remove: jest.fn(),
  currentTime: 0,
};

type MockStatus = {
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
};

const defaultStatus: MockStatus = {
  playing: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
  isBuffering: false,
  isLoaded: true,
};

const mockUseStatus = jest.fn<MockStatus, []>(() => defaultStatus);

jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockUseStatus(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockedCreateClient = jest.mocked(createApiClient);

const THIS_DEVICE = "this-device";

const track = (id: string, title: string) => ({
  id,
  title,
  trackNumber: 1,
  discNumber: 1,
  artistName: "Fleetwood Mac",
  albumTitle: "Rumours",
  coverArtUrl: null,
  durationSeconds: 254,
  artists: [],
});

const SESSION: PlaybackSession = {
  trackQueue: [
    track("t1", "Second Hand News"),
    track("t2", "Dreams"),
    track("t3", "Songbird"),
  ],
  currentTrackIndex: 1,
  currentTrackPositionInSeconds: 42,
  currentTrackAccumulatedPlayTimeInSeconds: 10,
  currentTrackListenEventCreated: false,
  isPlaying: false,
  activeDeviceId: THIS_DEVICE,
};

let queryClient: QueryClient;
let get: jest.Mock;

function clientWith(): ApiClient {
  return { get, post: jest.fn(), put: jest.fn(), delete: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.currentTime = 0;
  mockPlayer.seekTo.mockResolvedValue(undefined);
  mockUseStatus.mockReturnValue(defaultStatus);
  mockHolder.onMessage = undefined;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  });
  get = jest.fn().mockResolvedValue(SESSION);
  mockedCreateClient.mockReturnValue(clientWith());
});

afterEach(() => queryClient.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PlaybackProvider>{children}</PlaybackProvider>
    </QueryClientProvider>
  );
}

/** Render, wait for the first-paint session, then connect + push a snapshot. */
async function renderActive(sessionOverrides: Partial<PlaybackSession> = {}) {
  const session = { ...SESSION, ...sessionOverrides };
  get.mockResolvedValue(session);
  const utils = renderHook(() => usePlayback(), { wrapper });
  await waitFor(() => expect(utils.result.current.currentTrack).not.toBeNull());
  act(() => {
    mockHolder.onMessage?.({
      type: "connected",
      data: { deviceId: THIS_DEVICE },
    });
    mockHolder.onMessage?.({
      type: "session-updated",
      data: session,
      serverTimeMs: 1000,
    });
  });
  return utils;
}

describe("PlaybackProvider (active device)", () => {
  it("loads the current track with auth headers and restores position", async () => {
    await renderActive();

    expect(mockPlayer.replace).toHaveBeenCalledWith({
      uri: "https://music.home.arpa/api/tracks/t2/stream",
      headers: { Authorization: "Bearer tok" },
    });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it("starts playback when the session says it is playing", async () => {
    await renderActive({ isPlaying: true });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
  });

  it("sets lock-screen metadata for the current track", async () => {
    await renderActive();
    await waitFor(() =>
      expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          title: "Dreams",
          artist: "Fleetwood Mac",
          albumTitle: "Rumours",
        }),
      ),
    );
  });

  it("disarms the lock screen when the device hands off and becomes passive", async () => {
    await renderActive();
    await waitFor(() =>
      expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
        true,
        expect.anything(),
      ),
    );
    mockPlayer.setActiveForLockScreen.mockClear();

    act(() => {
      mockHolder.onMessage?.({
        type: "session-updated",
        data: { ...SESSION, activeDeviceId: "other-device" },
        serverTimeMs: 2000,
      });
    });

    await waitFor(() =>
      expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(false),
    );
  });

  it("togglePlay applies locally and reports the live position", async () => {
    const { result } = await renderActive();
    mockPlayer.currentTime = 50;

    act(() => result.current.togglePlay());

    expect(mockPlayer.play).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({
      type: "state-report",
      data: expect.objectContaining({
        isPlaying: true,
        currentTrackIndex: 1,
        positionSeconds: 50,
      }),
    });
  });

  it("next advances and reports the following track", async () => {
    const { result } = await renderActive();

    act(() => result.current.next());

    expect(mockPlayer.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "https://music.home.arpa/api/tracks/t3/stream",
      }),
    );
    expect(mockSend).toHaveBeenCalledWith({
      type: "state-report",
      data: expect.objectContaining({
        currentTrackIndex: 2,
        positionSeconds: 0,
      }),
    });
  });

  it("advances the queue when the track finishes", async () => {
    const { rerender } = await renderActive();

    mockUseStatus.mockReturnValue({ ...defaultStatus, didJustFinish: true });
    rerender({});

    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({
        type: "state-report",
        data: expect.objectContaining({ currentTrackIndex: 2 }),
      }),
    );
  });
});

describe("PlaybackProvider (passive device)", () => {
  async function renderPassive(overrides: Partial<PlaybackSession> = {}) {
    const session = {
      ...SESSION,
      activeDeviceId: "other-device",
      ...overrides,
    };
    get.mockResolvedValue(session);
    const utils = renderHook(() => usePlayback(), { wrapper });
    await waitFor(() =>
      expect(utils.result.current.currentTrack).not.toBeNull(),
    );
    act(() => {
      mockHolder.onMessage?.({
        type: "connected",
        data: { deviceId: THIS_DEVICE },
      });
      mockHolder.onMessage?.({
        type: "session-updated",
        data: session,
        serverTimeMs: 1000,
      });
    });
    return utils;
  }

  it("never loads the source or plays while passive", async () => {
    await renderPassive({ isPlaying: true });
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it("relays transport commands instead of writing state", async () => {
    const { result } = await renderPassive();

    act(() => result.current.togglePlay());

    expect(mockSend).toHaveBeenCalledWith({
      type: "command",
      data: { kind: "setPlaying", value: true },
    });
  });

  it("shows the session position, not its silent player's", async () => {
    const { result } = await renderPassive({
      isPlaying: true,
      currentTrackPositionInSeconds: 30,
    });
    expect(result.current.position).toBeGreaterThanOrEqual(30);
    expect(result.current.position).toBeLessThan(35);
  });
});

describe("PlaybackProvider", () => {
  it("exposes a null track and no-op actions with an empty queue", async () => {
    get.mockResolvedValue({ ...SESSION, trackQueue: [], currentTrackIndex: 0 });
    const { result } = renderHook(() => usePlayback(), { wrapper });
    expect(result.current.currentTrack).toBeNull();
    act(() => expect(() => result.current.togglePlay()).not.toThrow());
  });
});
