import {
  UnifiedAlbumDetailSchema,
  type UnifiedAlbumDetail,
} from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * Album detail by `albumKey` — a local cuid2 album id (owned albums) or a
 * MusicBrainz release-group MBID (explore-search albums). The server resolves
 * either to a `source: "local"` or `source: "external"` payload.
 */
export function useAlbumDetail(albumKey: string | undefined) {
  return useAuthedQuery<UnifiedAlbumDetail>(
    ["album", albumKey ?? ""],
    `/api/albums/${encodeURIComponent(albumKey ?? "")}`,
    UnifiedAlbumDetailSchema,
    { enabled: !!albumKey },
  );
}
