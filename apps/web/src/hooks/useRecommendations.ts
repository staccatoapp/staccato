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

// Duck-typed to avoid a Zod v3/v4 version mismatch: the web bundle resolves
// Zod v4 transitively while @staccato/shared ships Zod v3 schemas. Replace
// this interface with z.ZodType<T> once @staccato/shared is upgraded to Zod v4.
interface ParseSchema<T> {
  parse(data: unknown): T;
}

async function fetchJson<T>(url: string, schema: ParseSchema<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return schema.parse(await res.json());
}

function useRecommendationQuery<T>(
  key: string,
  url: string,
  schema: ParseSchema<RecommendationsResponse<T>>,
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
