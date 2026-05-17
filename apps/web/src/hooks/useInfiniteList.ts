import { useMemo } from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

interface UseInfiniteListOptions {
  queryKey: QueryKey;
  endpoint: string;
  enabled?: boolean;
  pageSize?: number;
  staleTime?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export function useInfiniteList<T>({
  queryKey,
  endpoint,
  enabled = true,
  pageSize = 50,
  staleTime = 30_000,
}: UseInfiniteListOptions) {
  const query = useInfiniteQuery<PaginatedResponse<T>>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const offset = typeof pageParam === "number" ? pageParam : 0;
      const url = `${endpoint}?limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const totalFetched = pages.reduce(
        (sum, p) => sum + (p?.items?.length ?? 0),
        0,
      );
      if (lastPage?.total == null) return undefined;
      return totalFetched < lastPage.total ? totalFetched : undefined;
    },
    enabled,
    staleTime,
  });

  const items = useMemo<T[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const total = query.data?.pages[0]?.total ?? 0;

  return { ...query, items, total };
}
