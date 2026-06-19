import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import type { PlaybackSession } from "@staccato/shared";

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

const mockEnsureArtworkFile = jest.fn();
jest.mock("@/lib/storage/artwork-cache", () => ({
  ensureArtworkFile: (...args: unknown[]) => mockEnsureArtworkFile(...args),
}));

const mockedCreateClient = jest.mocked(createApiClient);

const track = (id: string, title: string) => ({
  id,
  title,
  trackNumber: 1,
  discNumber: 1,
  artistName: "Fleetwood Mac",
  albumTitle: "Rumours",
  coverArtUrl: `/metadata/covers/${id}.jpg`,
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
};

let queryClient: QueryClient;
let get: jest.Mock;
let put: jest.Mock;

function clientWith(): ApiClient {
  return {
    get,
    post: jest.fn(),
    put,
    patch: jest.fn(),
    delete: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureArtworkFile.mockResolvedValue(null);
  mockPlayer.currentTime = 0;
  mockPlayer.seekTo.mockResolvedValue(undefined);
  mockUseStatus.mockReturnValue(defaultStatus);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  });
  get = jest.fn().mockResolvedValue(SESSION);
  put = jest.fn().mockResolvedValue(SESSION);
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

async function renderPlayback() {
  const utils = renderHook(() => usePlayback(), { wrapper });
  await waitFor(() => expect(utils.result.current.currentTrack).not.toBeNull());
  return utils;
}

describe("PlaybackProvider", () => {
  it("loads the current track into the player with auth headers and restores position", async () => {
    await renderPlayback();

    expect(mockPlayer.replace).toHaveBeenCalledWith({
      uri: "https://music.home.arpa/api/tracks/t2/stream",
      headers: { Authorization: "Bearer tok" },
    });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it("starts playback when the session says it is playing", async () => {
    get.mockResolvedValue({ ...SESSION, isPlaying: true });
    put.mockResolvedValue({ ...SESSION, isPlaying: true });

    await renderPlayback();

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
  });

  it("does not set lock-screen metadata until the duration is known (avoids 'LIVE')", async () => {
    // Player is loaded but the duration is not yet determined; publishing now
    // makes iOS render the Now Playing widget as a live stream ("LIVE", no
    // scrubber). The provider must wait for a real duration.
    mockUseStatus.mockReturnValue({
      ...defaultStatus,
      isLoaded: true,
      duration: 0,
    });

    await renderPlayback();

    expect(mockPlayer.setActiveForLockScreen).not.toHaveBeenCalled();
  });

  it("sets lock-screen metadata with isLiveStream:false once the duration is known", async () => {
    mockUseStatus.mockReturnValue({ ...defaultStatus, duration: 254 });

    await renderPlayback();

    expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        title: "Dreams",
        artist: "Fleetwood Mac",
        albumTitle: "Rumours",
      }),
      { isLiveStream: false },
    );
  });

  it("caches the cover and sets it as lock-screen artwork once ready", async () => {
    mockEnsureArtworkFile.mockResolvedValue("file://blobs/cover.jpg");
    mockUseStatus.mockReturnValue({ ...defaultStatus, duration: 254 });

    await renderPlayback();

    await waitFor(() =>
      expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          title: "Dreams",
          artworkUrl: "file://blobs/cover.jpg",
        }),
        { isLiveStream: false },
      ),
    );
    expect(mockEnsureArtworkFile).toHaveBeenCalledWith(
      "/metadata/covers/t2.jpg",
      {
        serverUrl: "https://music.home.arpa",
        token: "tok",
      },
    );
  });

  it("togglePlay PUTs the flipped play state", async () => {
    const { result } = await renderPlayback();
    mockPlayer.currentTime = 50;

    act(() => result.current.togglePlay());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          isPlaying: true,
          currentTrackIndex: 1,
          currentTrackPositionInSeconds: 50,
        }),
        expect.anything(),
      ),
    );
  });

  it("next advances to the following track with reset accounting", async () => {
    const { result } = await renderPlayback();

    act(() => result.current.next());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          currentTrackIndex: 2,
          currentTrackPositionInSeconds: 0,
          currentTrackAccumulatedPlayTimeInSeconds: 0,
          currentTrackListenEventCreated: false,
        }),
        expect.anything(),
      ),
    );
  });

  it("prev within 3 seconds goes to the previous track", async () => {
    const { result } = await renderPlayback();
    mockPlayer.currentTime = 2;

    act(() => result.current.prev());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({ currentTrackIndex: 0 }),
        expect.anything(),
      ),
    );
  });

  it("prev past 3 seconds restarts the current track", async () => {
    const { result } = await renderPlayback();
    mockPlayer.currentTime = 30;

    act(() => result.current.prev());

    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          currentTrackIndex: 1,
          currentTrackPositionInSeconds: 0,
        }),
        expect.anything(),
      ),
    );
  });

  it("seekTo seeks the player and PUTs the new position", async () => {
    const { result } = await renderPlayback();

    act(() => result.current.seekTo(120));

    expect(mockPlayer.seekTo).toHaveBeenCalledWith(120);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({ currentTrackPositionInSeconds: 120 }),
        expect.anything(),
      ),
    );
  });

  it("jumpToIndex starts the chosen track from the top", async () => {
    const { result } = await renderPlayback();

    act(() => result.current.jumpToIndex(2));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          isPlaying: true,
          currentTrackIndex: 2,
          currentTrackPositionInSeconds: 0,
          currentTrackAccumulatedPlayTimeInSeconds: 0,
          currentTrackListenEventCreated: false,
        }),
        expect.anything(),
      ),
    );
  });

  it("advances the queue when the track finishes", async () => {
    const { rerender } = await renderPlayback();

    mockUseStatus.mockReturnValue({
      ...defaultStatus,
      playing: false,
      didJustFinish: true,
    });
    rerender({});

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          isPlaying: true,
          currentTrackIndex: 2,
          currentTrackListenEventCreated: false,
        }),
        expect.anything(),
      ),
    );
  });

  it("accumulates play time only for genuine playback deltas", async () => {
    const { result, rerender } = await renderPlayback();

    // Genuine ticks: 42 → 43 → 44 (accumulated 10 + 2 = 12), then a seek
    // jump to 200 that must not count.
    mockUseStatus.mockReturnValue({
      ...defaultStatus,
      playing: true,
      currentTime: 43,
    });
    rerender({});
    mockUseStatus.mockReturnValue({
      ...defaultStatus,
      playing: true,
      currentTime: 44,
    });
    rerender({});
    mockUseStatus.mockReturnValue({
      ...defaultStatus,
      playing: true,
      currentTime: 200,
    });
    rerender({});

    mockPlayer.currentTime = 200;
    act(() => result.current.togglePlay());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/state",
        expect.objectContaining({
          currentTrackAccumulatedPlayTimeInSeconds: 12,
        }),
        expect.anything(),
      ),
    );
  });

  it("playTracks replaces the queue and starts playback via /session/play", async () => {
    const { result } = await renderPlayback();

    act(() => result.current.playTracks(["lt-1"], 0));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/api/playback/session/play",
        { trackIds: ["lt-1"], startIndex: 0 },
        expect.anything(),
      ),
    );
  });

  it("playTracks is a no-op for an empty track list", async () => {
    const { result } = await renderPlayback();
    put.mockClear();

    act(() => result.current.playTracks([], 0));

    expect(put).not.toHaveBeenCalledWith(
      "/api/playback/session/play",
      expect.anything(),
      expect.anything(),
    );
  });

  it("exposes a null track and no-op actions when there is no playback session yet", () => {
    get.mockResolvedValue({ ...SESSION, trackQueue: [], currentTrackIndex: 0 });

    const { result } = renderHook(() => usePlayback(), { wrapper });

    expect(result.current.currentTrack).toBeNull();
    expect(() => result.current.togglePlay()).not.toThrow();
  });
});
