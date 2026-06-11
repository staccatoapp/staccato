import {
  RecommendedPlaylistsResponseSchema,
  type RecommendedPlaylistsResponse,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

export function useRecommendedPlaylists() {
  return useAuthedQuery<RecommendedPlaylistsResponse>(
    ["recommendations", "playlists"],
    "/api/recommendations/playlists",
    RecommendedPlaylistsResponseSchema,
    {
      staleTime: 10 * 60 * 1000,
      refetchInterval: (query) =>
        query.state.data?.status === "warming" ? 5000 : false,
    },
  );
}
