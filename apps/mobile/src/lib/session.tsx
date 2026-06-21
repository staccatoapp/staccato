import { AuthenticatedUserResponseSchema } from "@staccato/shared";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ApiError, createApiClient } from "./api-client";
import { clearStoredToken } from "./auth-storage";
import { loadInitialSession, type Session } from "./session-bootstrap";

async function clearSessionState(
  queryClient: QueryClient,
  setSession: (session: Session | null) => void,
): Promise<void> {
  await clearStoredToken();
  queryClient.clear();
  setSession(null);
}

/** Minimum dwell so the launch splash never flashes. */
const MIN_DWELL_MS = 800;

/** How often to re-probe the server while offline. */
const RECONNECT_INTERVAL_MS = 15_000;

/**
 * Reachability of the configured server, orthogonal to whether we hold
 * credentials (`session`). `offline` means we have a session but the last probe
 * failed; `reconnecting` is the transient state while a probe is in flight.
 * Only meaningful when `session` is non-null.
 */
export type ConnectionStatus = "online" | "offline" | "reconnecting";

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  connectionStatus: ConnectionStatus;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  /** Probe the server now (used by the offline UI's "Try again"). */
  retryConnection: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}

/** Convenience selector: true only when the server is reachable. */
export function useIsConnected(): boolean {
  return useSession().connectionStatus === "online";
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("online");

  const signIn = useCallback((next: Session) => {
    setSession(next);
    setConnectionStatus("online");
  }, []);

  const [queryClient] = useState(() => {
    const qc = new QueryClient({
      queryCache: new QueryCache({
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            console.warn("query hit a 401; signing out", err);
            void clearSessionState(qc, setSession);
          }
        },
      }),
    });
    return qc;
  });

  const signOut = useCallback(async () => {
    await clearSessionState(queryClient, setSession);
    setConnectionStatus("online");
  }, [queryClient]);

  // The probe reads the latest session without being a dependency, so the
  // callback stays stable and the auto-retry interval isn't torn down on every
  // session change.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  // Guards against overlapping probes (a manual retry racing the auto-retry).
  const probingRef = useRef(false);

  const probeConnection = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || probingRef.current) return;
    probingRef.current = true;
    setConnectionStatus("reconnecting");
    try {
      const client = createApiClient(current.serverUrl, current.token);
      await client.get("/api/auth/me", AuthenticatedUserResponseSchema);
      setConnectionStatus("online");
      // Server is back: refetch everything the paused query hooks were holding.
      void queryClient.invalidateQueries();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        console.warn("reconnect probe hit a 401; signing out", { err });
        await clearSessionState(queryClient, setSession);
        setConnectionStatus("online");
      } else {
        console.warn("reconnect probe failed; staying offline", { err });
        setConnectionStatus("offline");
      }
    } finally {
      probingRef.current = false;
    }
  }, [queryClient]);

  const retryConnection = useCallback(() => {
    void probeConnection();
  }, [probeConnection]);

  // Bootstrap: keep the splash up for at least MIN_DWELL_MS, then apply the
  // resolved session + reachability.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const dwell = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, MIN_DWELL_MS);
    });
    Promise.all([loadInitialSession(), dwell])
      .then(([result]) => {
        if (cancelled) return;
        if (result.status === "authenticated") {
          setSession(result.session);
          setConnectionStatus("online");
        } else if (result.status === "offline") {
          setSession(result.session);
          setConnectionStatus("offline");
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn("session bootstrap failed unexpectedly", err);
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // While offline, re-probe on an interval so connectivity coming back is
  // picked up without user action. Torn down once no longer offline (and during
  // each in-flight `reconnecting` probe), restarted if the probe leaves us
  // offline again.
  useEffect(() => {
    if (connectionStatus !== "offline") return;
    const id = setInterval(() => {
      void probeConnection();
    }, RECONNECT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connectionStatus, probeConnection]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext
        value={{
          session,
          isLoading,
          connectionStatus,
          signIn,
          signOut,
          retryConnection,
        }}
      >
        {children}
      </SessionContext>
    </QueryClientProvider>
  );
}
