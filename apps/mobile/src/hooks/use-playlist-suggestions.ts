import {
  PlaylistSuggestionsResponseSchema,
  type PlaylistSuggestionsResponse,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * "Suggested tracks" for an in-library playlist — `GET /api/playlists/:id/suggestions`.
 * ListenBrainz/Last.fm similarity against the playlist's own tracks. Polls while
 * the server is still computing (`warming`); the UI hides the block on
 * `no-token` or an empty result.
 */
export function usePlaylistSuggestions(id: string | undefined) {
  return useAuthedQuery<PlaylistSuggestionsResponse>(
    ["playlist", id ?? "", "suggestions"],
    `/api/playlists/${encodeURIComponent(id ?? "")}/suggestions`,
    PlaylistSuggestionsResponseSchema,
    {
      enabled: !!id,
      staleTime: 5 * 60 * 1000,
      refetchInterval: (query) =>
        query.state.data?.status === "warming" ? 5000 : false,
    },
  );
}
