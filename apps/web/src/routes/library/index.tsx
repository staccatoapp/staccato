import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import type {
  AlbumListItem,
  Artist,
  LibrarySearchResults,
  PlaylistListItem,
  TrackListItem,
} from "@staccato/shared";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/library/")({
  component: LibraryPage,
});

function formatTotalDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

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

  const albumsQuery = useQuery({
    queryKey: ["albums"],
    queryFn: async (): Promise<{ items: AlbumListItem[]; total: number }> => {
      const res = await fetch("/api/library/albums?limit=500");
      if (!res.ok) throw new Error("Failed to fetch albums");
      return res.json();
    },
    staleTime: 30_000,
  });

  const tracksQuery = useQuery({
    queryKey: ["tracks"],
    queryFn: async (): Promise<{ items: TrackListItem[]; total: number }> => {
      const res = await fetch("/api/library/tracks?limit=1000");
      if (!res.ok) throw new Error("Failed to fetch tracks");
      return res.json();
    },
    staleTime: 30_000,
  });

  const artistsQuery = useQuery({
    queryKey: ["artists"],
    queryFn: async (): Promise<{ items: Artist[]; total: number }> => {
      const res = await fetch("/api/library/artists?limit=500");
      if (!res.ok) throw new Error("Failed to fetch artists");
      return res.json();
    },
    staleTime: 30_000,
  });

  const playlistsQuery = useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
    staleTime: 30_000,
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

  const albumCountByArtistId = useMemo(() => {
    const map = new Map<string, number>();
    albumsQuery.data?.items.forEach((a) =>
      map.set(a.artistId, (map.get(a.artistId) ?? 0) + 1),
    );
    return map;
  }, [albumsQuery.data]);

  const totalDurationSeconds = useMemo(
    () =>
      tracksQuery.data?.items.reduce(
        (s, t) => s + (t.durationSeconds ?? 0),
        0,
      ) ?? 0,
    [tracksQuery.data],
  );

  const { data: playbackSession } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async () => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch session");
      return res.json();
    },
  });
  const activeTrackId = playbackSession?.currentTrack?.id as string | undefined;
  const isPlaying = playbackSession?.isPlaying as boolean | undefined;

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
        return albumsQuery.data
          ? `${albumsQuery.data.total} albums`
          : "Loading…";
      case "artists":
        return artistsQuery.data
          ? `${artistsQuery.data.total} artists`
          : "Loading…";
      case "tracks":
        return tracksQuery.data
          ? `${tracksQuery.data.total} tracks`
          : "Loading…";
      case "playlists":
        return playlistsQuery.data
          ? `${playlistsQuery.data.items.length} playlists`
          : "Loading…";
    }
  })();

  const matchedPlaylists =
    isSearchMode && playlistsQuery.data
      ? playlistsQuery.data.items.filter((p) =>
          p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
        )
      : [];

  const tracks = tracksQuery.data?.items ?? [];

  return (
    <div className="p-7 pb-24 min-h-full">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        {albumsQuery.data && tracksQuery.data && (
          <span className="text-sm text-muted-foreground">
            {formatTotalDuration(totalDurationSeconds)} ·{" "}
            {albumsQuery.data.total} albums
          </span>
        )}
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
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      albumCount={albumCountByArtistId.get(artist.id)}
                    />
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
                      releaseYear={album.releaseYear}
                      coverArtUrl={album.coverArtUrl}
                      href={`/library/albums/${album.id}`}
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
            <div
              className="grid gap-x-4 gap-y-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {albumsQuery.isLoading
                ? Array.from({ length: 18 }).map((_, i) => (
                    <AlbumCardSkeleton key={i} />
                  ))
                : albumsQuery.data?.items.map((album) => (
                    <AlbumCard
                      key={album.id}
                      title={album.title}
                      artistName={album.artistName}
                      releaseYear={album.releaseYear}
                      coverArtUrl={album.coverArtUrl}
                      href={`/library/albums/${album.id}`}
                    />
                  ))}
            </div>
          )}

          {activeTab === "artists" && (
            <div
              className="grid gap-x-4 gap-y-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {artistsQuery.isLoading
                ? Array.from({ length: 18 }).map((_, i) => (
                    <AlbumCardSkeleton key={i} />
                  ))
                : artistsQuery.data?.items.map((artist) => (
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      albumCount={albumCountByArtistId.get(artist.id)}
                    />
                  ))}
            </div>
          )}

          {activeTab === "tracks" && (
            <>
              {tracksQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <TrackList
                  tracks={tracks}
                  activeTrackId={activeTrackId}
                  isPlaying={isPlaying}
                  onPlayTrack={(i) => handlePlayTracks(tracks, i)}
                />
              )}
            </>
          )}

          {activeTab === "playlists" && (
            <div
              className="grid gap-x-4 gap-y-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {playlistsQuery.isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <AlbumCardSkeleton key={i} />
                  ))
                : playlistsQuery.data?.items.map((pl) => (
                    <PlaylistCard key={pl.id} playlist={pl} />
                  ))}
            </div>
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
