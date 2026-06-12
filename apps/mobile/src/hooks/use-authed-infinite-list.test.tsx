import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import { z } from "zod";

import { createApiClient } from "@/lib/api-client";
import { useAuthedInfiniteList } from "./use-authed-infinite-list";

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
const ItemSchema = z.object({ id: z.string() });

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

describe("useAuthedInfiniteList", () => {
  it("fetches the first page with limit/offset + extra params and flattens items", async () => {
    const get = jest
      .fn()
      .mockResolvedValue({ items: [{ id: "a" }, { id: "b" }], total: 5 });
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(
      () =>
        useAuthedInfiniteList(
          ["albums", "title"],
          "/api/library/albums",
          ItemSchema,
          { params: { sort: "title" }, pageSize: 2 },
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(
      "/api/library/albums?limit=2&offset=0&sort=title",
      expect.anything(),
    );
    expect(result.current.items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(result.current.total).toBe(5);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("pages via offset and stops when all items are loaded", async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "a" }, { id: "b" }], total: 3 })
      .mockResolvedValueOnce({ items: [{ id: "c" }], total: 3 });
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(
      () =>
        useAuthedInfiniteList(["albums"], "/api/library/albums", ItemSchema, {
          pageSize: 2,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    expect(get).toHaveBeenLastCalledWith(
      "/api/library/albums?limit=2&offset=2",
      expect.anything(),
    );
    expect(result.current.items).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });
});
