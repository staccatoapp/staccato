import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  ApiErrorResponseSchema,
  AuthenticatedUserResponseSchema,
  type AuthenticatedUserResponse,
} from "@staccato/shared";

export const currentUserQueryOptions = queryOptions({
  queryKey: ["auth-me"],
  queryFn: async (): Promise<AuthenticatedUserResponse> => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      const parsed = ApiErrorResponseSchema.safeParse(await res.json());
      throw new Error(
        parsed.success ? parsed.data.error : `HTTP ${res.status}`,
      );
    }
    return AuthenticatedUserResponseSchema.parse(await res.json());
  },
  staleTime: 5 * 60_000,
});

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions);
}
