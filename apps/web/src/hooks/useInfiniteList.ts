import { useMemo } from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Paginated } from "@staccato/shared";

// Duck-typed to avoid a Zod v3/v4 version mismatch: the web bundle resolves
// Zod v4 transitively while @staccato/shared ships Zod v3 schemas. Replace
// this interface with z.ZodType<T> once @staccato/shared is upgraded to Zod v4.
interface ParseSchema<T> {
  parse(data: unknown): T;
}

interface UseInfiniteListOptions<T> {
  queryKey: QueryKey;
  endpoint: string;
  schema: ParseSchema<T>;
  enabled?: boolean;
  pageSize?: number;
  staleTime?: number;
}

export function useInfiniteList<T>({
  queryKey,
  endpoint,
  schema,
  enabled = true,
  pageSize = 50,
  staleTime = 30_000,
}: UseInfiniteListOptions<T>) {
  const query = useInfiniteQuery<Paginated<T>>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const offset = typeof pageParam === "number" ? pageParam : 0;
      const url = `${endpoint}?limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
      const raw = (await res.json()) as { items: unknown[]; total: number };
      return {
        items: raw.items.map((item) => schema.parse(item)),
        total: raw.total,
      };
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
