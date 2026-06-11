import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import { ApiError } from "./api-client";
import { clearStoredToken } from "./auth-storage";
import { loadInitialSession } from "./session-bootstrap";
import { SessionProvider, useSession } from "./session";

jest.mock("./auth-storage");
jest.mock("./session-bootstrap");

const mockedLoad = jest.mocked(loadInitialSession);
const mockedClearToken = jest.mocked(clearStoredToken);

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

  it("starts loading, then resolves to the bootstrapped session", async () => {
    mockedLoad.mockResolvedValue({
      serverUrl: "https://music.example.com",
      token: "tok",
    });

    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.session).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toEqual({
      serverUrl: "https://music.example.com",
      token: "tok",
    });
  });

  it("signIn sets the session synchronously", async () => {
    mockedLoad.mockResolvedValue(null);
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
  });

  it("signOut clears the stored token and the session", async () => {
    mockedLoad.mockResolvedValue({
      serverUrl: "https://music.example.com",
      token: "tok",
    });
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
    mockedLoad.mockResolvedValue({
      serverUrl: "https://music.example.com",
      token: "tok",
    });
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
    mockedLoad.mockResolvedValue({
      serverUrl: "https://music.example.com",
      token: "tok",
    });
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
