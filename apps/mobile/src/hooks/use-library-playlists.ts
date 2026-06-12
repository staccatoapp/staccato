import {
  PlaylistListItemSchema,
  type PlaylistListItem,
  type PlaylistSort,
} from "@staccato/shared";

import { useAuthedInfiniteList } from "./use-authed-infinite-list";

/**
 * Paged playlists for the Library Playlists tab, sorted server-side. Also kept
 * enabled in search mode so the results view can filter playlists by name
 * client-side (mirrors the web Library).
 */
export function useLibraryPlaylists(sort: PlaylistSort, enabled = true) {
  return useAuthedInfiniteList<PlaylistListItem>(
    ["library", "playlists", sort],
    "/api/playlists",
    PlaylistListItemSchema,
    { params: { sort }, enabled },
  );
}
