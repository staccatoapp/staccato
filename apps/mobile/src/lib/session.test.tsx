import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import { ApiError, createApiClient } from "./api-client";
import { clearStoredToken } from "./auth-storage";
import { loadInitialSession } from "./session-bootstrap";
import { SessionProvider, useSession } from "./session";

jest.mock("./auth-storage");
jest.mock("./session-bootstrap");
jest.mock("./api-client", () => {
  const actual = jest.requireActual("./api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockedLoad = jest.mocked(loadInitialSession);
const mockedClearToken = jest.mocked(clearStoredToken);
const mockedCreateClient = jest.mocked(createApiClient);

const SESSION = { serverUrl: "https://music.example.com", token: "tok" };

function mockProbe(get: jest.Mock) {
  mockedCreateClient.mockReturnValue({
    get,
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

describe("SessionProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts loading, then resolves to the bootstrapped session online", async () => {
    mockedLoad.mockResolvedValue({ status: "authenticated", session: SESSION });

    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.session).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toEqual(SESSION);
    expect(result.current.connectionStatus).toBe("online");
  });

  it("starts offline (session kept) when the server is unreachable on launch", async () => {
    mockedLoad.mockResolvedValue({ status: "offline", session: SESSION });

    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toEqual(SESSION);
    expect(result.current.connectionStatus).toBe("offline");
  });

  it("retryConnection reconnects to online when the server is reachable again", async () => {
    mockedLoad.mockResolvedValue({ status: "offline", session: SESSION });
    mockProbe(jest.fn().mockResolvedValue({ id: "u1" }));

    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() =>
      expect(result.current.connectionStatus).toBe("offline"),
    );

    await act(async () => {
      result.current.retryConnection();
    });

    await waitFor(() => expect(result.current.connectionStatus).toBe("online"));
    expect(result.current.session).toEqual(SESSION);
  });

  it("retryConnection stays offline when the server is still unreachable", async () => {
    mockedLoad.mockResolvedValue({ status: "offline", session: SESSION });
    mockProbe(jest.fn().mockRejectedValue(new Error("still down")));
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() =>
      expect(result.current.connectionStatus).toBe("offline"),
    );

    await act(async () => {
      result.current.retryConnection();
    });

    await waitFor(() =>
      expect(result.current.connectionStatus).toBe("offline"),
    );
    expect(mockedCreateClient).toHaveBeenCalledWith(
      SESSION.serverUrl,
      SESSION.token,
    );
  });

  it("auto-retries on an interval while offline and recovers to online", async () => {
    mockedLoad.mockResolvedValue({ status: "offline", session: SESSION });
    const get = jest.fn().mockResolvedValue({ id: "u1" });
    mockProbe(get);

    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() =>
      expect(result.current.connectionStatus).toBe("offline"),
    );
    expect(get).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    await waitFor(() => expect(result.current.connectionStatus).toBe("online"));
    expect(get).toHaveBeenCalledWith("/api/auth/me", expect.anything());
  });

  it("signs out when the reconnect probe is rejected with a 401", async () => {
    mockedLoad.mockResolvedValue({ status: "offline", session: SESSION });
    mockedClearToken.mockResolvedValue();
    mockProbe(jest.fn().mockRejectedValue(new ApiError(401, "unauthorized")));
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() =>
      expect(result.current.connectionStatus).toBe("offline"),
    );

    await act(async () => {
      result.current.retryConnection();
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(mockedClearToken).toHaveBeenCalled();
  });

  it("signIn sets the session synchronously online", async () => {
    mockedLoad.mockResolvedValue({ status: "unauthenticated" });
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.signIn({
        serverUrl: "https://music.example.com",
        token: "fresh",
      });
    });
    expect(result.current.session).toEqual({
      serverUrl: "https://music.example.com",
      token: "fresh",
    });
    expect(result.current.connectionStatus).toBe("online");
  });

  it("signOut clears the stored token and the session", async () => {
    mockedLoad.mockResolvedValue({ status: "authenticated", session: SESSION });
    mockedClearToken.mockResolvedValue();
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });
    expect(mockedClearToken).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it("signOut clears the query cache", async () => {
    mockedLoad.mockResolvedValue({ status: "authenticated", session: SESSION });
    mockedClearToken.mockResolvedValue();

    // Capture the provider's QueryClient from inside the tree.
    const qcRef: { current: ReturnType<typeof useQueryClient> | null } = {
      current: null,
    };

    const { result } = renderHook(
      () => {
        const sessionCtx = useSession();
        const qc = useQueryClient();
        qcRef.current = qc;
        return sessionCtx;
      },
      { wrapper },
    );

    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    // Seed the cache with a probe entry.
    act(() => {
      qcRef.current!.setQueryData(["probe"], "cached");
    });
    expect(qcRef.current!.getQueryData(["probe"])).toBe("cached");

    // Sign out — cache must be wiped.
    await act(async () => {
      await result.current.signOut();
    });

    expect(mockedClearToken).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(qcRef.current!.getQueryData(["probe"])).toBeUndefined();
  });

  it("clears the stored token and nulls the session on a 401 query error", async () => {
    mockedLoad.mockResolvedValue({ status: "authenticated", session: SESSION });
    mockedClearToken.mockResolvedValue();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Start with the failing query disabled so it does not race with bootstrap.
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        const sessionCtx = useSession();
        useQuery({
          queryKey: ["test-401"],
          enabled,
          queryFn: (): Promise<never> =>
            Promise.reject(new ApiError(401, "unauthorized")),
          retry: false,
        });
        return sessionCtx;
      },
      { wrapper, initialProps: { enabled: false } },
    );

    // Advance past the dwell so bootstrap resolves and sets the session.
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    // Enable the failing query now that a real session is in place.
    rerender({ enabled: true });

    // The 401 error must trigger automatic sign-out.
    await waitFor(() => {
      expect(mockedClearToken).toHaveBeenCalled();
      expect(result.current.session).toBeNull();
    });

    errorSpy.mockRestore();
  });

  it("throws when useSession is used outside a provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(
      "useSession must be used within a SessionProvider",
    );
    spy.mockRestore();
  });
});
