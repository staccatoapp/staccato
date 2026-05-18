import { useQuery } from "@tanstack/react-query";
import type {
  RecommendationsResponse,
  RecommendedPlaylist,
  RecommendedTrack,
} from "@staccato/shared";

type TracksResponse = RecommendationsResponse<RecommendedTrack[]>;
type PlaylistsResponse = RecommendationsResponse<RecommendedPlaylist[]>;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function useRecommendationQuery<T>(key: string, url: string) {
  return useQuery<RecommendationsResponse<T>>({
    queryKey: ["recommendations", key],
    queryFn: () => fetchJson<RecommendationsResponse<T>>(url),
    staleTime: 10 * 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.status === "warming" ? 5000 : false,
  });
}

export function useRecommendedTracks() {
  return useRecommendationQuery<RecommendedTrack[]>(
    "tracks",
    "/api/recommendations/tracks",
  );
}

export function useRecommendedPlaylists() {
  return useRecommendationQuery<RecommendedPlaylist[]>(
    "playlists",
    "/api/recommendations/playlists",
  );
}

export type { TracksResponse, PlaylistsResponse };
