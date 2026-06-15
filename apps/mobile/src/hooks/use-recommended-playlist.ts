import type { RecommendedPlaylist } from "@staccato/shared";

import { useRecommendedPlaylists } from "./use-recommended-playlists";

export interface RecommendedPlaylistResult {
  playlist: RecommendedPlaylist | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * A single recommended playlist, selected by id from the cached
 * `useRecommendedPlaylists` query (the list response embeds every playlist's
 * full track list, so the detail screen needs no extra fetch). `isLoading`
 * stays true while the recommendations are still warming; `isError` covers a
 * failed fetch or a ready response that no longer contains the id.
 */
export function useRecommendedPlaylist(
  id: string | undefined,
): RecommendedPlaylistResult {
  const { data, isLoading, isError } = useRecommendedPlaylists();

  if (isLoading)
    return { playlist: undefined, isLoading: true, isError: false };
  if (isError || !data) {
    return { playlist: undefined, isLoading: false, isError: true };
  }
  if (data.status === "warming") {
    return { playlist: undefined, isLoading: true, isError: false };
  }
  if (data.status === "no-token") {
    return { playlist: undefined, isLoading: false, isError: true };
  }

  const list = data.data ?? [];
  const playlist = list.find((p) => p.id === id);
  return {
    playlist,
    isLoading: false,
    isError: !playlist,
  };
}
