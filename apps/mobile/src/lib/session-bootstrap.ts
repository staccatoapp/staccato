import { AuthenticatedUserResponseSchema } from "@staccato/shared";

import { ApiError, createApiClient } from "./api-client";
import {
  clearStoredToken,
  getStoredServerUrl,
  getStoredToken,
} from "./auth-storage";

export interface Session {
  serverUrl: string;
  token: string;
}

/**
 * Resolves the stored session on launch: returns a validated session when a
 * stored token is accepted by the stored server, otherwise null. A 401 means
 * the token is dead, so it is cleared; network failures keep the token
 * (connectivity may come back later) but still start unauthenticated.
 */
export async function loadInitialSession(): Promise<Session | null> {
  const [token, serverUrl] = await Promise.all([
    getStoredToken(),
    getStoredServerUrl(),
  ]);
  if (!token || !serverUrl) {
    return null;
  }

  try {
    const client = createApiClient(serverUrl, token);
    await client.get("/api/auth/me", AuthenticatedUserResponseSchema);
    return { serverUrl, token };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn("stored session token rejected; clearing it", err);
      await clearStoredToken();
    } else {
      console.warn("session check failed; starting unauthenticated", err);
    }
    return null;
  }
}
