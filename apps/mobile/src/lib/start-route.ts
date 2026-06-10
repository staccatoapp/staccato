import { AuthenticatedUserResponseSchema } from "@staccato/shared";

import { ApiError, createApiClient } from "./api-client";
import {
  clearStoredToken,
  getStoredServerUrl,
  getStoredToken,
} from "./auth-storage";

export type StartRoute = "/(home)" | "/(auth)/connect";

/**
 * Decides where the app lands after the splash: home when a stored session
 * token is accepted by the stored server, otherwise the connect screen.
 * A 401 means the token is dead, so it is cleared; network failures keep the
 * token (connectivity may come back later).
 */
export async function resolveStartRoute(): Promise<StartRoute> {
  const [token, serverUrl] = await Promise.all([
    getStoredToken(),
    getStoredServerUrl(),
  ]);
  if (!token || !serverUrl) {
    return "/(auth)/connect";
  }

  try {
    const client = createApiClient(serverUrl, token);
    await client.get("/api/auth/me", AuthenticatedUserResponseSchema);
    return "/(home)";
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn("stored session token rejected; clearing it", err);
      await clearStoredToken();
    } else {
      console.warn("session check failed; falling back to connect", err);
    }
    return "/(auth)/connect";
  }
}
