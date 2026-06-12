import {
  LibrarySearchResultsSchema,
  type LibrarySearchResults,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * Cross-entity library search (tracks/albums; artists are returned but the
 * Library design doesn't surface them). Only runs while `enabled` (the screen
 * gates this on a trimmed query of >= 2 chars).
 */
export function useLibrarySearch(query: string, enabled: boolean) {
  return useAuthedQuery<LibrarySearchResults>(
    ["library", "search", query],
    `/api/library/search?q=${encodeURIComponent(query)}`,
    LibrarySearchResultsSchema,
    { enabled, staleTime: 30_000 },
  );
}
