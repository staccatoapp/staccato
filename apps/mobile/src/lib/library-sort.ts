import type { AlbumSort, ArtistSort, PlaylistSort } from "@staccato/shared";

/**
 * The four sort pills shown on every Library tab (design: "Dense Catalog").
 * Non-applicable keys fall back per-tab via the resolvers below.
 */
export type LibrarySortKey = "createdAt" | "title" | "artist" | "year";

export const LIBRARY_SORT_OPTIONS: { id: LibrarySortKey; label: string }[] = [
  { id: "createdAt", label: "Recently Added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "year", label: "Release Year" },
];

export type LibraryTab = "albums" | "artists" | "playlists";

/**
 * Which sort keys each tab actually supports. Albums sort by all four; artists
 * and playlists only by recently-added and title (their backends have no
 * artist/release-year column to sort on).
 */
const SORT_KEYS_BY_TAB: Record<LibraryTab, LibrarySortKey[]> = {
  albums: ["createdAt", "title", "artist", "year"],
  artists: ["createdAt", "title"],
  playlists: ["createdAt", "title"],
};

/** Sort pills to show for a tab, in canonical order. */
export function sortOptionsForTab(
  tab: LibraryTab,
): { id: LibrarySortKey; label: string }[] {
  return LIBRARY_SORT_OPTIONS.filter((o) =>
    SORT_KEYS_BY_TAB[tab].includes(o.id),
  );
}

export function isSortKeyValidForTab(
  tab: LibraryTab,
  key: LibrarySortKey,
): boolean {
  return SORT_KEYS_BY_TAB[tab].includes(key);
}

/** Albums support all four keys directly. */
export function resolveAlbumSort(key: LibrarySortKey): AlbumSort {
  return key;
}

/** Artists sort by name (title) or recently-added; year falls back. */
export function resolveArtistSort(key: LibrarySortKey): ArtistSort {
  return key === "title" || key === "artist" ? "title" : "createdAt";
}

/** Playlists sort by name (title) or recently-added; artist/year fall back. */
export function resolvePlaylistSort(key: LibrarySortKey): PlaylistSort {
  return key === "title" ? "title" : "createdAt";
}
