import {
  AuthenticatedUserResponseSchema,
  type AuthenticatedUserResponse,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/** The signed-in user (drives the Admin segmented control + account card). */
export function useCurrentUser() {
  return useAuthedQuery<AuthenticatedUserResponse>(
    ["auth-me"],
    "/api/auth/me",
    AuthenticatedUserResponseSchema,
    { staleTime: 5 * 60 * 1000 },
  );
}
