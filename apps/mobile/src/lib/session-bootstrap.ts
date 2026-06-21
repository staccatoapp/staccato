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
 * Outcome of resolving the stored session on launch. The two failure modes are
 * deliberately distinct: a rejected token (401) is dead and clears, but an
 * unreachable server keeps the credentials so the app can run **offline** and
 * reconnect later. `unauthenticated` therefore means "no usable credentials"
 * (none stored, or the token was cleared), not merely "couldn't verify".
 */
export type BootstrapResult =
  | { status: "authenticated"; session: Session }
  | { status: "offline"; session: Session }
  | { status: "unauthenticated" };

/**
 * Resolves the stored session on launch. Returns `authenticated` when a stored
 * token is accepted by the stored server; `offline` (keeping the token +
 * session) when the server is unreachable, so connectivity can come back later;
 * and `unauthenticated` when there are no stored credentials or the token was
 * rejected (401) and cleared.
 */
export async function loadInitialSession(): Promise<BootstrapResult> {
  const [token, serverUrl] = await Promise.all([
    getStoredToken(),
    getStoredServerUrl(),
  ]);
  if (!token || !serverUrl) {
    return { status: "unauthenticated" };
  }

  try {
    const client = createApiClient(serverUrl, token);
    await client.get("/api/auth/me", AuthenticatedUserResponseSchema);
    return { status: "authenticated", session: { serverUrl, token } };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn("stored session token rejected; clearing it", err);
      await clearStoredToken();
      return { status: "unauthenticated" };
    }
    // Network failure / timeout: keep the credentials and start offline.
    console.warn("session check failed; starting offline", err);
    return { status: "offline", session: { serverUrl, token } };
  }
}
