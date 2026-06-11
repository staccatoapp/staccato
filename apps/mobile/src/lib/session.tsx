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
  useState,
} from "react";

import { ApiError } from "./api-client";
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

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signIn = useCallback((next: Session) => setSession(next), []);

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

  const signOut = useCallback(
    () => clearSessionState(queryClient, setSession),
    [queryClient],
  );

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const dwell = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, MIN_DWELL_MS);
    });
    Promise.all([loadInitialSession(), dwell])
      .then(([next]) => {
        if (!cancelled) {
          setSession(next);
          setIsLoading(false);
        }
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

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext value={{ session, isLoading, signIn, signOut }}>
        {children}
      </SessionContext>
    </QueryClientProvider>
  );
}
