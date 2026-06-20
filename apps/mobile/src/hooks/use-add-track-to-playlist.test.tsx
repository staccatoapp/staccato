import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

import { createApiClient } from "@/lib/api-client";
import { useAddTrackToPlaylist } from "./use-add-track-to-playlist";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
    isLoading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockedCreateClient = jest.mocked(createApiClient);

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => queryClient.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAddTrackToPlaylist", () => {
  it("posts the track id to the playlist's tracks endpoint", async () => {
    const post = jest.fn().mockResolvedValue(null);
    mockedCreateClient.mockReturnValue({
      get: jest.fn(),
      post,
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => useAddTrackToPlaylist(), { wrapper });
    result.current.mutate({ playlistId: "pl-1", trackId: "t1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith(
      "/api/playlists/pl-1/tracks",
      { trackIds: ["t1"] },
      expect.anything(),
    );
  });

  it("invalidates the Library list and playlist detail keys on success", async () => {
    const post = jest.fn().mockResolvedValue(null);
    mockedCreateClient.mockReturnValue({
      get: jest.fn(),
      post,
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAddTrackToPlaylist(), { wrapper });
    result.current.mutate({ playlistId: "pl-1", trackId: "t1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const SERVER_URL = "https://music.home.arpa";
    // Library Playlists tab + the sheet's own list.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["library", "playlists", SERVER_URL],
    });
    // The detail screen for the playlist that was added to.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["playlist", "pl-1", SERVER_URL],
    });
    // The home-screen playlist list (the hook's primary key) too.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["playlists", SERVER_URL],
    });
  });
});
