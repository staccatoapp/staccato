import { useMemo } from "react";
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { paginatedSchema, type Paginated } from "@staccato/shared";
import type { z } from "zod";

import { useSession } from "@/lib/session";
import { useApiClient } from "./use-api-client";

interface AuthedInfiniteListOptions {
  /** Extra query params appended after limit/offset (e.g. `{ sort }`). */
  params?: Record<string, string>;
  /** Items fetched per page (also the `limit`). */
  pageSize?: number;
  /** Defaults to enabled; still gated on an active session. */
  enabled?: boolean;
  staleTime?: number;
}

type AuthedInfiniteListResult<T> = UseInfiniteQueryResult<
  InfiniteData<Paginated<T>>,
  Error
> & {
  /** All loaded pages flattened, in order. */
  items: T[];
  /** Server-reported total (from the first page). */
  total: number;
};

/**
 * Offset-paged analog of {@link useAuthedQuery} for `{ items, total }` list
 * endpoints. Mirrors the web's `useInfiniteList`: server-scoped query key,
 * disabled until there is a session, each page validated with
 * `paginatedSchema(itemSchema)` through the session-bound {@link useApiClient}.
 * Returns the flattened `items` and `total` alongside the usual query fields.
 */
export function useAuthedInfiniteList<T>(
  key: QueryKey,
  endpoint: string,
  itemSchema: z.ZodType<T>,
  options?: AuthedInfiniteListOptions,
): AuthedInfiniteListResult<T> {
  const { session, connectionStatus } = useSession();
  const client = useApiClient();
  const pageSize = options?.pageSize ?? 50;
  const responseSchema = useMemo(
    () => paginatedSchema(itemSchema),
    [itemSchema],
  );

  const query = useInfiniteQuery<Paginated<T>>({
    queryKey: [...key, session?.serverUrl],
    queryFn: ({ pageParam }) => {
      if (!client) {
        throw new Error(
          "useAuthedInfiniteList requires an authenticated session",
        );
      }
      const offset = typeof pageParam === "number" ? pageParam : 0;
      const search = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        ...options?.params,
      });
      return client.get(`${endpoint}?${search.toString()}`, responseSchema);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    // Paused while offline (see useAuthedQuery) — recovery refetches via the
    // reconnect probe's query invalidation.
    enabled:
      !!session && connectionStatus === "online" && (options?.enabled ?? true),
    staleTime: options?.staleTime,
  });

  const items = useMemo<T[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total ?? 0;

  return { ...query, items, total };
}
