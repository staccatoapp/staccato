import {
  type AlbumListItem,
  type Artist,
  type PlaylistListItem,
} from "@staccato/shared";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";

import {
  AlbumCell,
  ArtistCell,
  LibrarySearchResults,
  PlaylistCell,
  SortPills,
  UnderlineTabs,
} from "@/components/library";
import { SearchField } from "@/components/ui/search-field";
import { useLibraryAlbums } from "@/hooks/use-library-albums";
import { useLibraryArtists } from "@/hooks/use-library-artists";
import { useLibraryPlaylists } from "@/hooks/use-library-playlists";
import { useLibrarySearch } from "@/hooks/use-library-search";
import {
  isSortKeyValidForTab,
  resolveAlbumSort,
  resolveArtistSort,
  resolvePlaylistSort,
  sortOptionsForTab,
  type LibrarySortKey,
  type LibraryTab,
} from "@/lib/library-sort";
import { useTheme } from "@/theme";

const SCREEN_PADDING = 16;
const GRID_GAP = 10;

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const columnWidth = Math.floor((width - SCREEN_PADDING * 2 - GRID_GAP) / 2);

  const [tab, setTab] = useState<LibraryTab>("albums");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortKey, setSortKey] = useState<LibrarySortKey>("createdAt");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Sort persists across tabs where applicable; switching to a tab that can't
  // sort by the current key falls back to recently-added.
  function handleTabChange(next: LibraryTab) {
    setTab(next);
    if (!isSortKeyValidForTab(next, sortKey)) setSortKey("createdAt");
  }

  const searching = debouncedQuery.trim().length >= 2;

  const albumsQuery = useLibraryAlbums(
    resolveAlbumSort(sortKey),
    !searching && tab === "albums",
  );
  const artistsQuery = useLibraryArtists(
    resolveArtistSort(sortKey),
    !searching && tab === "artists",
  );
  // Playlists stay enabled while searching so results can filter them by name.
  const playlistsQuery = useLibraryPlaylists(
    resolvePlaylistSort(sortKey),
    searching || tab === "playlists",
  );
  const searchQuery = useLibrarySearch(debouncedQuery.trim(), searching);

  const matchedPlaylists = useMemo(
    () =>
      searching
        ? playlistsQuery.items.filter((p) =>
            p.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase()),
          )
        : [],
    [searching, debouncedQuery, playlistsQuery.items],
  );

  const activeQuery =
    tab === "albums"
      ? albumsQuery
      : tab === "artists"
        ? artistsQuery
        : playlistsQuery;

  const data: (AlbumListItem | Artist | PlaylistListItem)[] = searching
    ? []
    : activeQuery.items;

  const renderItem: ListRenderItem<
    AlbumListItem | Artist | PlaylistListItem
  > = ({ item }) => {
    if (tab === "albums") {
      const album = item as AlbumListItem;
      return (
        <AlbumCell
          album={album}
          size={columnWidth}
          onPress={() =>
            router.push({
              pathname: "/(home)/library/album/[albumKey]",
              params: { albumKey: album.id },
            })
          }
        />
      );
    }
    if (tab === "artists") {
      // TODO: open artist detail once the mobile detail screen exists.
      return <ArtistCell artist={item as Artist} size={columnWidth} />;
    }
    const playlist = item as PlaylistListItem;
    return (
      <PlaylistCell
        playlist={playlist}
        size={columnWidth}
        onPress={() =>
          router.push({
            pathname: "/(home)/library/playlist/[playlistKey]",
            params: { playlistKey: playlist.id },
          })
        }
      />
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={data}
      numColumns={2}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      columnWrapperStyle={{
        paddingHorizontal: SCREEN_PADDING,
        gap: GRID_GAP,
        marginBottom: tab === "artists" ? 14 : 10,
      }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 34 }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (!searching && activeQuery.hasNextPage) activeQuery.fetchNextPage();
      }}
      ListHeaderComponent={
        <View>
          {/* Search — always present */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search library"
              compact
            />
          </View>

          {!searching ? (
            <>
              <UnderlineTabs<LibraryTab>
                options={[
                  { id: "albums", label: "Albums", count: albumsQuery.total },
                  {
                    id: "artists",
                    label: "Artists",
                    count: artistsQuery.total,
                  },
                  {
                    id: "playlists",
                    label: "Playlists",
                    count: playlistsQuery.total,
                  },
                ]}
                value={tab}
                onChange={handleTabChange}
              />
              <View style={{ paddingTop: 12, paddingBottom: 8 }}>
                <SortPills
                  options={sortOptionsForTab(tab)}
                  value={sortKey}
                  onChange={setSortKey}
                />
              </View>
            </>
          ) : null}
        </View>
      }
      ListFooterComponent={
        searching ? (
          <LibrarySearchResults
            query={debouncedQuery.trim()}
            data={searchQuery.data}
            playlists={matchedPlaylists}
          />
        ) : null
      }
    />
  );
}
