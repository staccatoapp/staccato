import { PlaylistDetailSchema, type PlaylistDetail } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/**
 * In-library playlist detail by id — `GET /api/playlists/:id`. Every track is
 * owned (playable in full); the response carries a cover-art mosaic for the hero.
 */
export function usePlaylistDetail(id: string | undefined) {
  return useAuthedQuery<PlaylistDetail>(
    ["playlist", id ?? ""],
    `/api/playlists/${encodeURIComponent(id ?? "")}`,
    PlaylistDetailSchema,
    { enabled: !!id },
  );
}
