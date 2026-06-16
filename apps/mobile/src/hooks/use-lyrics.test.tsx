import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import type { TrackLyrics } from "@staccato/shared";

import { createApiClient } from "@/lib/api-client";
import { useLyrics } from "./use-lyrics";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockedCreateClient = jest.mocked(createApiClient);

const LYRICS: TrackLyrics = {
  trackId: "t1",
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: [
    { startingTime: 0, lyrics: "First line" },
    { startingTime: 5, lyrics: "Second line" },
  ],
};

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  });
});

afterEach(() => queryClient.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLyrics", () => {
  it("fetches lyrics for the given track", async () => {
    const get = jest.fn().mockResolvedValue(LYRICS);
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => useLyrics("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(
      "/api/playback/lyrics?trackId=t1",
      expect.anything(),
    );
    expect(result.current.data).toEqual(LYRICS);
  });

  it("resolves null when the server has no lyrics (204)", async () => {
    // The api client maps a 204 to null when the schema allows it.
    const get = jest.fn().mockResolvedValue(null);
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => useLyrics("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("stays disabled without a track id", () => {
    const get = jest.fn();
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => useLyrics(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});
