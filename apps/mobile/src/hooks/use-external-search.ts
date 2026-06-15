import {
  ExternalSearchResultsSchema,
  type ExternalSearchResults,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/** Minimum query length before the server runs an external search. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Unified MusicBrainz/ListenBrainz search via `/api/search/external`. One call
 * fans out across recordings, artists, and releases; the server marks
 * in-library tracks and attaches cover art / artist images. Disabled until the
 * (already-debounced) query reaches {@link MIN_SEARCH_LENGTH}, matching the
 * server's own floor.
 */
export function useExternalSearch(query: string) {
  const trimmed = query.trim();
  return useAuthedQuery<ExternalSearchResults>(
    ["external-search", trimmed],
    `/api/search/external?q=${encodeURIComponent(trimmed)}`,
    ExternalSearchResultsSchema,
    {
      enabled: trimmed.length >= MIN_SEARCH_LENGTH,
      staleTime: 60_000,
    },
  );
}
