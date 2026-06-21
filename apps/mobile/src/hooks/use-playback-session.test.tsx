import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import type { PlaybackSession } from "@staccato/shared";

import { createApiClient } from "@/lib/api-client";
import { usePlaybackSession } from "./use-playback-session";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockedCreateClient = jest.mocked(createApiClient);

const SESSION: PlaybackSession = {
  trackQueue: [
    {
      id: "t1",
      title: "Dreams",
      trackNumber: 2,
      discNumber: 1,
      artistName: "Fleetwood Mac",
      albumTitle: "Rumours",
      coverArtUrl: null,
      durationSeconds: 254,
      artists: [],
    },
  ],
  currentTrackIndex: 0,
  currentTrackPositionInSeconds: 0,
  currentTrackAccumulatedPlayTimeInSeconds: 0,
  currentTrackListenEventCreated: false,
  // Not playing, so the hook's 5s refetch interval stays off during tests.
  isPlaying: false,
};

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
    connectionStatus: "online",
  });
});

afterEach(() => queryClient.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("usePlaybackSession", () => {
  it("fetches the playback session from the server", async () => {
    const get = jest.fn().mockResolvedValue(SESSION);
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => usePlaybackSession(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(
      "/api/playback/session",
      expect.anything(),
    );
    expect(result.current.data).toEqual(SESSION);
  });

  it("stays disabled when there is no session", () => {
    const get = jest.fn();
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });
    mockUseSession.mockReturnValue({ session: null });

    const { result } = renderHook(() => usePlaybackSession(), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});
