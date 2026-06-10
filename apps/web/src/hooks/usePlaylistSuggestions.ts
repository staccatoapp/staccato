import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  PlaylistSuggestionsResponseSchema,
  type PlaylistSuggestionsResponse,
} from "@staccato/shared";

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return schema.parse(await res.json());
}

export function usePlaylistSuggestions(playlistId: string) {
  return useQuery<PlaylistSuggestionsResponse>({
    queryKey: ["playlist-suggestions", playlistId],
    queryFn: () =>
      fetchJson(
        `/api/playlists/${playlistId}/suggestions`,
        PlaylistSuggestionsResponseSchema,
      ),
    staleTime: 10 * 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.status === "warming" ? 5000 : false,
  });
}
