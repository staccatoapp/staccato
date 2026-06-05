import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  RecommendedPlaylistsResponseSchema,
  RecommendedTracksResponseSchema,
} from "@staccato/shared";
import type {
  RecommendationsResponse,
  RecommendedPlaylist,
  RecommendedTrack,
} from "@staccato/shared";

type TracksResponse = RecommendationsResponse<RecommendedTrack[]>;
type PlaylistsResponse = RecommendationsResponse<RecommendedPlaylist[]>;

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return schema.parse(await res.json());
}

function useRecommendationQuery<T>(
  key: string,
  url: string,
  schema: z.ZodType<RecommendationsResponse<T>>,
) {
  return useQuery<RecommendationsResponse<T>>({
    queryKey: ["recommendations", key],
    queryFn: () => fetchJson<RecommendationsResponse<T>>(url, schema),
    staleTime: 10 * 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.status === "warming" ? 5000 : false,
  });
}

export function useRecommendedTracks() {
  return useRecommendationQuery<RecommendedTrack[]>(
    "tracks",
    "/api/recommendations/tracks",
    RecommendedTracksResponseSchema,
  );
}

export function useRecommendedPlaylists() {
  return useRecommendationQuery<RecommendedPlaylist[]>(
    "playlists",
    "/api/recommendations/playlists",
    RecommendedPlaylistsResponseSchema,
  );
}

export type { TracksResponse, PlaylistsResponse };
