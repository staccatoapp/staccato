import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import { z } from "zod";

import { createApiClient } from "@/lib/api-client";
import { useAuthedQuery } from "./use-authed-query";

jest.mock("@/lib/api-client", () => {
  const actual = jest.requireActual("@/lib/api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockedCreateClient = jest.mocked(createApiClient);
const schema = z.object({ ok: z.boolean() });

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

describe("useAuthedQuery", () => {
  it("fetches via the session client and scopes the key by server url", async () => {
    const data = { ok: true };
    const get = jest.fn().mockResolvedValue(data);
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(
      () => useAuthedQuery(["thing"], "/api/thing", schema),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/thing", schema);
    expect(result.current.data).toEqual(data);
    expect(
      queryClient.getQueryData(["thing", "https://music.home.arpa"]),
    ).toEqual(data);
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
    mockUseSession.mockReturnValue({
      session: null,
      connectionStatus: "online",
    });

    const { result } = renderHook(
      () => useAuthedQuery(["thing"], "/api/thing", schema),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("stays disabled while offline even with a session", () => {
    const get = jest.fn();
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });
    mockUseSession.mockReturnValue({
      session: { serverUrl: "https://music.home.arpa", token: "tok" },
      connectionStatus: "offline",
    });

    const { result } = renderHook(
      () => useAuthedQuery(["thing"], "/api/thing", schema),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("respects a caller-provided enabled:false", () => {
    const get = jest.fn();
    mockedCreateClient.mockReturnValue({
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    });

    const { result } = renderHook(
      () => useAuthedQuery(["thing"], "/api/thing", schema, { enabled: false }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});
