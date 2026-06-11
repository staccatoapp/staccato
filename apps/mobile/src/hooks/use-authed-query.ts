import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { z } from "zod";

import { useSession } from "@/lib/session";
import { useApiClient } from "./use-api-client";

type AuthedQueryOptions<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/**
 * Wraps `useQuery` for session-scoped GET endpoints. Centralises the auth
 * contract every data hook would otherwise repeat: the query key is namespaced
 * by the active server URL, the query is disabled until there is a session, and
 * the request goes through the session-bound {@link useApiClient}. Pass-through
 * options (staleTime, refetchInterval, a stricter `enabled`, …) are forwarded.
 */
export function useAuthedQuery<T>(
  key: QueryKey,
  path: string,
  schema: z.ZodType<T>,
  options?: AuthedQueryOptions<T>,
): UseQueryResult<T> {
  const { session } = useSession();
  const client = useApiClient();
  return useQuery<T>({
    ...options,
    queryKey: [...key, session?.serverUrl],
    queryFn: () => {
      if (!client) {
        throw new Error("useAuthedQuery requires an authenticated session");
      }
      return client.get(path, schema);
    },
    enabled: !!session && (options?.enabled ?? true),
  });
}
