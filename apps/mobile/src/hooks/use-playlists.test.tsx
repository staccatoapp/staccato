import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

import { createApiClient } from "@/lib/api-client";
import { usePlaylists } from "./use-playlists";

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
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => {
  queryClient.clear();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("usePlaylists", () => {
  beforeEach(() => jest.clearAllMocks());

  it("builds the client from the session and fetches playlists", async () => {
    const data = { items: [] };
    const get = jest.fn().mockResolvedValue(data);
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(() => usePlaylists(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreateClient).toHaveBeenCalledWith(
      "https://music.home.arpa",
      "tok",
    );
    expect(get).toHaveBeenCalledWith("/api/playlists", expect.anything());
    expect(result.current.data).toEqual(data);
  });
});
