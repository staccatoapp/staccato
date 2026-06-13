import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";

import type { ApiClient } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { useApiClient } from "./use-api-client";

interface AuthedMutationOptions<TData, TVariables> {
  /**
   * Applied to the cached entry under the namespaced key before the request
   * settles; rolled back automatically if the mutation fails.
   */
  optimisticUpdate?: (
    old: TData | undefined,
    variables: TVariables,
  ) => TData | undefined;
}

/**
 * Write-side counterpart to {@link useAuthedQuery}: runs a mutation through
 * the session-bound {@link useApiClient}, optimistically updates the cache
 * entry scoped by the active server URL, rolls back on error, and invalidates
 * the key once the mutation settles.
 */
export function useAuthedMutation<TData, TVariables = void>(
  key: QueryKey,
  mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>,
  options?: AuthedMutationOptions<TData, TVariables>,
): UseMutationResult<
  TData,
  Error,
  TVariables,
  { previous: TData | undefined }
> {
  const { session } = useSession();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const namespacedKey = [...key, session?.serverUrl];

  return useMutation<TData, Error, TVariables, { previous: TData | undefined }>(
    {
      mutationFn: (variables) => {
        if (!client) {
          throw new Error(
            "useAuthedMutation requires an authenticated session",
          );
        }
        return mutationFn(client, variables);
      },
      onMutate: async (variables) => {
        if (!options?.optimisticUpdate) return { previous: undefined };
        await queryClient.cancelQueries({ queryKey: namespacedKey });
        const previous = queryClient.getQueryData<TData>(namespacedKey);
        queryClient.setQueryData<TData>(namespacedKey, (old) =>
          options.optimisticUpdate?.(old, variables),
        );
        return { previous };
      },
      onError: (_err, _variables, context) => {
        if (options?.optimisticUpdate && context) {
          queryClient.setQueryData(namespacedKey, context.previous);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: namespacedKey }).catch(() => {
          /* refetch failures surface via the query itself */
        });
      },
    },
  );
}
