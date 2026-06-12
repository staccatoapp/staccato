import {
  AlbumListItemSchema,
  type AlbumListItem,
  type AlbumSort,
} from "@staccato/shared";

import { useAuthedInfiniteList } from "./use-authed-infinite-list";

/** Paged albums for the Library Albums tab, sorted server-side. */
export function useLibraryAlbums(sort: AlbumSort, enabled = true) {
  return useAuthedInfiniteList<AlbumListItem>(
    ["library", "albums", sort],
    "/api/library/albums",
    AlbumListItemSchema,
    { params: { sort }, enabled },
  );
}
