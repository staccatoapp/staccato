import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlaybackSession } from "@staccato/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import type {
  AlbumListItem,
  Artist,
  LibrarySearchResults,
  PlaylistListItem,
  ServerSettings,
  TrackListItem,
} from "@staccato/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlbumCard, AlbumCardSkeleton } from "@/components/music/AlbumCard";
import { ArtistCard } from "@/components/library/artist-card";
import { PlaylistCard } from "@/components/library/playlist-card";
import { SectionHeader } from "@/components/library/section-header";
import { TrackList } from "@/components/library/track-list";
import { InfiniteGrid } from "@/components/library/infinite-grid";
import { useInfiniteList } from "@/hooks/useInfiniteList";

export const Route = createFileRoute("/library/")({
  component: LibraryPage,
});

function LibraryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "albums" | "artists" | "tracks" | "playlists"
  >("albums");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const isSearchMode = debouncedSearch.length >= 2;

  const { data: serverSettings } = useQuery<ServerSettings>({
    queryKey: ["server-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/server");
      if (!res.ok) throw new Error("Failed to fetch server settings");
      return res.json();
    },
    staleTime: Infinity,
  });
  const threshold = serverSettings?.metadataConfidenceThreshold ?? 0.75;

  const albumsQuery = useInfiniteList<AlbumListItem>({
    queryKey: ["albums"],
    endpoint: "/api/library/albums",
    enabled: !isSearchMode && activeTab === "albums",
  });

  const artistsQuery = useInfiniteList<Artist>({
    queryKey: ["artists"],
    endpoint: "/api/library/artists",
    enabled: !isSearchMode && activeTab === "artists",
  });

  const tracksQuery = useInfiniteList<TrackListItem>({
    queryKey: ["tracks"],
    endpoint: "/api/library/tracks",
    enabled: !isSearchMode && activeTab === "tracks",
  });

  const playlistsQuery = useInfiniteList<PlaylistListItem>({
    queryKey: ["playlists", "infinite"],
    endpoint: "/api/playlists",
    enabled: isSearchMode || activeTab === "playlists",
  });

  const searchResultsQuery = useQuery({
    queryKey: ["library-search", debouncedSearch],
    queryFn: async (): Promise<LibrarySearchResults> => {
      const res = await fetch(
        `/api/library/search?q=${encodeURIComponent(debouncedSearch)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: isSearchMode,
    staleTime: 30_000,
  });

  const fetchSession = useCallback(async (): Promise<PlaybackSession> => {
    const res = await fetch("/api/playback/session");
    if (!res.ok) throw new Error("Failed to fetch session");
    return res.json();
  }, []);

  const { data: activeTrackId } = useQuery({
    queryKey: ["playback-session"],
    queryFn: fetchSession,
    select: (s) => s?.trackQueue?.[s.currentTrackIndex]?.id,
  });
  const { data: isPlaying } = useQuery({
    queryKey: ["playback-session"],
    queryFn: fetchSession,
    select: (s) => Boolean(s?.isPlaying),
  });

  const playMutation = useMutation({
    mutationFn: async ({
      trackIds,
      startIndex,
    }: {
      trackIds: string[];
      startIndex: number;
    }) => {
      const res = await fetch("/api/playback/session/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds, startIndex }),
      });
      if (!res.ok) throw new Error("Failed to start playback");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playback-session"] });
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create playlist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setNewPlaylistOpen(false);
      setNewPlaylistName("");
    },
  });

  const handlePlayTracks = (tracks: TrackListItem[], startIndex: number) => {
    playMutation.mutate({
      trackIds: tracks.map((t) => t.id),
      startIndex,
    });
  };

  const countLabel = (() => {
    switch (activeTab) {
      case "albums":
        return albumsQuery.isSuccess ? `${albumsQuery.total} albums` : "Loading…";
      case "artists":
        return artistsQuery.isSuccess
          ? `${artistsQuery.total} artists`
          : "Loading…";
      case "tracks":
        return tracksQuery.isSuccess ? `${tracksQuery.total} tracks` : "Loading…";
      case "playlists":
        return playlistsQuery.isSuccess
          ? `${playlistsQuery.total} playlists`
          : "Loading…";
    }
  })();

  const matchedPlaylists = useMemo(
    () =>
      isSearchMode
        ? playlistsQuery.items.filter((p) =>
            p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
          )
        : [],
    [isSearchMode, debouncedSearch, playlistsQuery.items],
  );

  const fetchNextAlbums = useCallback(() => {
    albumsQuery.fetchNextPage();
  }, [albumsQuery.fetchNextPage]);
  const fetchNextArtists = useCallback(() => {
    artistsQuery.fetchNextPage();
  }, [artistsQuery.fetchNextPage]);
  const fetchNextTracks = useCallback(() => {
    tracksQuery.fetchNextPage();
  }, [tracksQuery.fetchNextPage]);
  const fetchNextPlaylists = useCallback(() => {
    playlistsQuery.fetchNextPage();
  }, [playlistsQuery.fetchNextPage]);

  const renderAlbum = useCallback(
    (album: AlbumListItem) => (
      <AlbumCard
        title={album.title}
        artistName={album.artistName}
        artists={album.artists}
        releaseYear={album.releaseYear}
        coverArtUrl={album.coverArtUrl}
        href={`/albums/${album.id}`}
        confidenceScore={album.confidenceScore}
        pendingTrackCount={album.pendingTrackCount}
        threshold={threshold}
      />
    ),
    [threshold],
  );
  const renderArtist = useCallback(
    (artist: Artist) => (
      <Link
        to="/artists/$artistKey"
        params={{ artistKey: artist.id }}
        className="block"
      >
        <ArtistCard artist={artist} albumCount={artist.albumCount} />
      </Link>
    ),
    [],
  );
  const renderPlaylist = useCallback(
    (pl: PlaylistListItem) => <PlaylistCard playlist={pl} />,
    [],
  );
  const renderAlbumSkeleton = useCallback(() => <AlbumCardSkeleton />, []);

  const playTracks = useCallback(
    (i: number) => handlePlayTracks(tracksQuery.items, i),
    // handlePlayTracks captures playMutation which is stable from useMutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracksQuery.items],
  );

  return (
    <div className="p-7 pb-24 min-h-full">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
      </div>

      {/* Search bar */}
      <div className="relative max-w-[320px] mb-5">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={searchInputRef}
          placeholder="Search library…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent border border-border rounded-lg text-sm pl-8 pr-7 py-1.5 h-9 outline-none focus:border-white/25 text-foreground placeholder:text-muted-foreground transition-colors"
        />
        {searchQuery && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              setSearchQuery("");
              searchInputRef.current?.focus();
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabs (hidden in search mode) */}
      {!isSearchMode && (
        <div className="flex gap-1.5 mb-4">
          {(["albums", "artists", "tracks", "playlists"] as const).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm capitalize transition-colors",
                  activeTab === tab
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground border border-border hover:border-border/80",
                )}
              >
                {tab}
              </button>
            ),
          )}
        </div>
      )}

      {/* Count row (hidden in search mode) */}
      {!isSearchMode && (
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-muted-foreground">{countLabel}</span>
          {activeTab === "playlists" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewPlaylistOpen(true)}
              className="gap-1.5 h-7 text-xs"
            >
              <Plus className="w-3 h-3" />
              New playlist
            </Button>
          )}
        </div>
      )}

      {/* Search mode */}
      {isSearchMode ? (
        searchResultsQuery.isFetching ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : (
          <div>
            {matchedPlaylists.length > 0 && (
              <div>
                <SectionHeader
                  label="Playlists"
                  count={matchedPlaylists.length}
                />
                <div
                  className="grid gap-x-4 gap-y-6"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                  }}
                >
                  {matchedPlaylists.map((pl) => (
                    <PlaylistCard key={pl.id} playlist={pl} />
                  ))}
                </div>
              </div>
            )}

            {(searchResultsQuery.data?.artists.length ?? 0) > 0 && (
              <div>
                <SectionHeader
                  label="Artists"
                  count={searchResultsQuery.data!.artists.length}
                />
                <div
                  className="grid gap-x-4 gap-y-6"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                  }}
                >
                  {searchResultsQuery.data!.artists.map((artist) => (
                    <Link
                      key={artist.id}
                      to="/artists/$artistKey"
                      params={{ artistKey: artist.id }}
                      className="block"
                    >
                      <ArtistCard artist={artist} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(searchResultsQuery.data?.albums.length ?? 0) > 0 && (
              <div>
                <SectionHeader
                  label="Albums"
                  count={searchResultsQuery.data!.albums.length}
                />
                <div
                  className="grid gap-x-4 gap-y-6"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                  }}
                >
                  {searchResultsQuery.data!.albums.map((album) => (
                    <AlbumCard
                      key={album.id}
                      title={album.title}
                      artistName={album.artistName}
                      artists={album.artists}
                      releaseYear={album.releaseYear}
                      coverArtUrl={album.coverArtUrl}
                      href={`/albums/${album.id}`}
                      confidenceScore={album.confidenceScore}
                      pendingTrackCount={album.pendingTrackCount}
                      threshold={threshold}
                    />
                  ))}
                </div>
              </div>
            )}

            {(searchResultsQuery.data?.tracks.length ?? 0) > 0 && (
              <div>
                <SectionHeader
                  label="Tracks"
                  count={searchResultsQuery.data!.tracks.length}
                />
                <TrackList
                  tracks={searchResultsQuery.data!.tracks as TrackListItem[]}
                  activeTrackId={activeTrackId}
                  isPlaying={isPlaying}
                  onPlayTrack={(i) =>
                    handlePlayTracks(
                      searchResultsQuery.data!.tracks as TrackListItem[],
                      i,
                    )
                  }
                />
              </div>
            )}

            {!searchResultsQuery.isFetching &&
              (searchResultsQuery.data?.tracks.length ?? 0) === 0 &&
              (searchResultsQuery.data?.albums.length ?? 0) === 0 &&
              (searchResultsQuery.data?.artists.length ?? 0) === 0 &&
              matchedPlaylists.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No results for "{debouncedSearch}"
                </p>
              )}
          </div>
        )
      ) : (
        /* Tab content */
        <>
          {activeTab === "albums" && (
            <InfiniteGrid<AlbumListItem>
              items={albumsQuery.items}
              isLoading={albumsQuery.isLoading}
              isFetchingNextPage={albumsQuery.isFetchingNextPage}
              hasNextPage={albumsQuery.hasNextPage}
              onEndReached={fetchNextAlbums}
              renderItem={renderAlbum}
              renderSkeleton={renderAlbumSkeleton}
            />
          )}

          {activeTab === "artists" && (
            <InfiniteGrid<Artist>
              items={artistsQuery.items}
              isLoading={artistsQuery.isLoading}
              isFetchingNextPage={artistsQuery.isFetchingNextPage}
              hasNextPage={artistsQuery.hasNextPage}
              onEndReached={fetchNextArtists}
              renderItem={renderArtist}
              renderSkeleton={renderAlbumSkeleton}
            />
          )}

          {activeTab === "tracks" && (
            <TrackList
              tracks={tracksQuery.items}
              activeTrackId={activeTrackId}
              isPlaying={isPlaying}
              onPlayTrack={playTracks}
              onEndReached={fetchNextTracks}
              isFetchingNextPage={tracksQuery.isFetchingNextPage}
              hasNextPage={tracksQuery.hasNextPage}
            />
          )}

          {activeTab === "playlists" && (
            <InfiniteGrid<PlaylistListItem>
              items={playlistsQuery.items}
              isLoading={playlistsQuery.isLoading}
              isFetchingNextPage={playlistsQuery.isFetchingNextPage}
              hasNextPage={playlistsQuery.hasNextPage}
              onEndReached={fetchNextPlaylists}
              renderItem={renderPlaylist}
              renderSkeleton={renderAlbumSkeleton}
              skeletonCount={8}
            />
          )}
        </>
      )}

      {/* New playlist dialog */}
      <Dialog open={newPlaylistOpen} onOpenChange={setNewPlaylistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            placeholder="Playlist name"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPlaylistName.trim())
                createPlaylistMutation.mutate(newPlaylistName.trim());
            }}
            className="w-full bg-transparent border border-border rounded-lg text-sm px-3 py-2 h-9 outline-none focus:border-white/25 text-foreground placeholder:text-muted-foreground transition-colors"
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewPlaylistOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                !newPlaylistName.trim() || createPlaylistMutation.isPending
              }
              onClick={() =>
                createPlaylistMutation.mutate(newPlaylistName.trim())
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
