import { TrackLyricsSchema } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * Lyrics for a track. The server answers 204 when it has none (the api client
 * maps that to `null` via the nullable schema). Lyrics never change within a
 * session, hence `staleTime: Infinity`.
 */
export function useLyrics(trackId: string | undefined) {
  return useAuthedQuery(
    ["lyrics", trackId],
    `/api/playback/lyrics?trackId=${encodeURIComponent(trackId ?? "")}`,
    TrackLyricsSchema.nullable(),
    {
      enabled: !!trackId,
      staleTime: Infinity,
    },
  );
}
