import { useQuery } from "@tanstack/react-query";
import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";

type TracksResponse = RecommendedTrack[] | { error: "no-id" | "no-listens" };
type PlaylistsResponse =
  | RecommendedPlaylist[]
  | { error: "no-id" | "no-listens" };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function useRecommendedTracks() {
  return useQuery<TracksResponse>({
    queryKey: ["recommendations", "tracks"],
    queryFn: () => fetchJson("/api/recommendations/tracks"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useRecommendedPlaylists() {
  return useQuery<PlaylistsResponse>({
    queryKey: ["recommendations", "playlists"],
    queryFn: () => fetchJson("/api/recommendations/playlists"),
    staleTime: 10 * 60 * 1000,
  });
}
