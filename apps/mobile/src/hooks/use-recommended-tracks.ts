import {
  RecommendedTracksResponseSchema,
  type RecommendedTracksResponse,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * The per-user recommended-tracks feed served to Explore. Like the playlists
 * feed it is a warming pull-through cache: poll every 5s while the server is
 * still generating it, then hold a 10-minute staleTime.
 */
export function useRecommendedTracks() {
  return useAuthedQuery<RecommendedTracksResponse>(
    ["recommendations", "tracks"],
    "/api/recommendations/tracks",
    RecommendedTracksResponseSchema,
    {
      staleTime: 10 * 60 * 1000,
      refetchInterval: (query) =>
        query.state.data?.status === "warming" ? 5000 : false,
    },
  );
}
