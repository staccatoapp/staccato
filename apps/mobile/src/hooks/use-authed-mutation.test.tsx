import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

import { createApiClient, type ApiClient } from "@/lib/api-client";
import { useAuthedMutation } from "./use-authed-mutation";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockedCreateClient = jest.mocked(createApiClient);

type Thing = { count: number };

const SERVER_URL = "https://music.home.arpa";
const NAMESPACED_KEY = ["thing", SERVER_URL];

let queryClient: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  // gcTime must outlive the test: cache entries written via setQueryData have
  // no observers, and gcTime 0 would collect them before assertions run.
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      // gcTime 0 so the mutation cache's gc timer doesn't keep jest alive.
      mutations: { retry: false, gcTime: 0 },
    },
  });
  mockUseSession.mockReturnValue({
    session: { serverUrl: SERVER_URL, token: "tok" },
  });
});

afterEach(() => queryClient.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function clientWith(overrides: Partial<ApiClient>): ApiClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  };
}

describe("useAuthedMutation", () => {
  it("runs the mutation through the session client", async () => {
    const put = jest.fn().mockResolvedValue({ count: 2 });
    mockedCreateClient.mockReturnValue(clientWith({ put }));

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, { increment: number }>(
          ["thing"],
          (client, vars) =>
            (client.put as jest.Mock)("/api/thing", vars) as Promise<Thing>,
        ),
      { wrapper },
    );

    result.current.mutate({ increment: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(put).toHaveBeenCalledWith("/api/thing", { increment: 1 });
    expect(result.current.data).toEqual({ count: 2 });
  });

  it("applies the optimistic update to the server-scoped cache entry", async () => {
    let resolveMutation: (value: Thing) => void = () => {};
    const put = jest.fn().mockReturnValue(
      new Promise<Thing>((resolve) => {
        resolveMutation = resolve;
      }),
    );
    mockedCreateClient.mockReturnValue(clientWith({ put }));
    queryClient.setQueryData<Thing>(NAMESPACED_KEY, { count: 1 });

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, { increment: number }>(
          ["thing"],
          (client, vars) =>
            (client.put as jest.Mock)("/api/thing", vars) as Promise<Thing>,
          {
            optimisticUpdate: (old, vars) =>
              old ? { count: old.count + vars.increment } : old,
          },
        ),
      { wrapper },
    );

    result.current.mutate({ increment: 5 });

    await waitFor(() =>
      expect(queryClient.getQueryData<Thing>(NAMESPACED_KEY)).toEqual({
        count: 6,
      }),
    );

    resolveMutation({ count: 6 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back the cache when the mutation fails", async () => {
    const put = jest.fn().mockRejectedValue(new Error("boom"));
    mockedCreateClient.mockReturnValue(clientWith({ put }));
    queryClient.setQueryData<Thing>(NAMESPACED_KEY, { count: 1 });

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, { increment: number }>(
          ["thing"],
          (client, vars) =>
            (client.put as jest.Mock)("/api/thing", vars) as Promise<Thing>,
          {
            optimisticUpdate: (old, vars) =>
              old ? { count: old.count + vars.increment } : old,
          },
        ),
      { wrapper },
    );

    result.current.mutate({ increment: 5 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<Thing>(NAMESPACED_KEY)).toEqual({
      count: 1,
    });
  });

  it("invalidates the server-scoped key once the mutation settles", async () => {
    const put = jest.fn().mockResolvedValue({ count: 2 });
    mockedCreateClient.mockReturnValue(clientWith({ put }));
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, void>(
          ["thing"],
          (client) =>
            (client.put as jest.Mock)("/api/thing", {}) as Promise<Thing>,
        ),
      { wrapper },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NAMESPACED_KEY });
  });

  it("invalidates the extra server-scoped keys from invalidateKeys", async () => {
    const put = jest.fn().mockResolvedValue({ count: 2 });
    mockedCreateClient.mockReturnValue(clientWith({ put }));
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, { id: string }>(
          ["thing"],
          (client, vars) =>
            (client.put as jest.Mock)("/api/thing", vars) as Promise<Thing>,
          {
            invalidateKeys: ({ id }) => [["things"], ["thing-detail", id]],
          },
        ),
      { wrapper },
    );

    result.current.mutate({ id: "x1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Primary key still invalidated.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NAMESPACED_KEY });
    // Static and variable-derived extra keys, each server-scoped.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["things", SERVER_URL],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["thing-detail", "x1", SERVER_URL],
    });
  });

  it("errors when there is no session", async () => {
    mockUseSession.mockReturnValue({ session: null });
    mockedCreateClient.mockReturnValue(clientWith({}));

    const { result } = renderHook(
      () =>
        useAuthedMutation<Thing, void>(
          ["thing"],
          (client) =>
            (client.put as jest.Mock)("/api/thing", {}) as Promise<Thing>,
        ),
      { wrapper },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/session/i);
  });
});
