import {
  PlaylistListResponseSchema,
  type PlaylistListResponse,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

export function usePlaylists() {
  return useAuthedQuery<PlaylistListResponse>(
    ["playlists"],
    "/api/playlists",
    PlaylistListResponseSchema,
    { staleTime: 5 * 60 * 1000 },
  );
}
