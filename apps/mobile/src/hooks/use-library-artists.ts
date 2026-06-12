import { ArtistSchema, type Artist, type ArtistSort } from "@staccato/shared";

import { useAuthedInfiniteList } from "./use-authed-infinite-list";

/** Paged artists for the Library Artists tab, sorted server-side. */
export function useLibraryArtists(sort: ArtistSort, enabled = true) {
  return useAuthedInfiniteList<Artist>(
    ["library", "artists", sort],
    "/api/library/artists",
    ArtistSchema,
    { params: { sort }, enabled },
  );
}
