import {
  UnifiedArtistDetailSchema,
  type UnifiedArtistDetail,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * Artist detail by `artistKey` — a local cuid2 artist id or a MusicBrainz
 * artist MBID. Used by the album screen's "More by artist" rail to list the
 * artist's other releases.
 */
export function useArtistDetail(artistKey: string | undefined) {
  return useAuthedQuery<UnifiedArtistDetail>(
    ["artist", artistKey ?? ""],
    `/api/artists/${encodeURIComponent(artistKey ?? "")}`,
    UnifiedArtistDetailSchema,
    { enabled: !!artistKey, staleTime: 5 * 60 * 1000 },
  );
}
