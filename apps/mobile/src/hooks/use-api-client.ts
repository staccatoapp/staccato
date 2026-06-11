import { useMemo } from "react";

import { createApiClient, type ApiClient } from "@/lib/api-client";
import { useSession } from "@/lib/session";

/**
 * Returns an {@link ApiClient} bound to the active session, or null when
 * unauthenticated. Memoised on the session's server URL and token so the same
 * client instance is reused until the session changes — callers no longer
 * thread `serverUrl`/`token` through `createApiClient` themselves.
 */
export function useApiClient(): ApiClient | null {
  const { session } = useSession();
  const serverUrl = session?.serverUrl;
  const token = session?.token;
  return useMemo(
    () => (serverUrl ? createApiClient(serverUrl, token) : null),
    [serverUrl, token],
  );
}
