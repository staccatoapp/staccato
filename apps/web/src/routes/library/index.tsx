import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Clock,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import type {
  AlbumListItem,
  Artist,
  LibrarySearchResults,
  PlaylistDetail,
  PlaylistListItem,
  TrackListItem,
} from "@staccato/shared";
import { formatTime, generateAlbumGradient } from "@/lib/music";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlbumCard, AlbumCardSkeleton } from "@/components/music/AlbumCard";

export const Route = createFileRoute("/library/")({
  component: LibraryPage,
});

function formatTotalDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

// ─── Artist Card ──────────────────────────────────────────────

function ArtistCard({
  artist,
  albumCount,
}: {
  artist: { id: string; name: string; imageUrl: string | null };
  albumCount?: number;
}) {
  return (
    <div className="group cursor-pointer min-w-0 text-center">
      <div
        className="relative aspect-square w-full rounded-full overflow-hidden mb-2.5 shadow-md"
        style={{
          background: artist.imageUrl
            ? undefined
            : generateAlbumGradient(artist.name, ""),
        }}
      >
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User className="w-8 h-8 text-white/15" />
          </div>
        )}
      </div>
      <p className="text-[0.8125rem] font-semibold text-foreground truncate leading-snug">
        {artist.name}
      </p>
      {albumCount != null && (
        <p className="text-[0.72rem] text-muted-foreground mt-0.5">
          {albumCount} {albumCount === 1 ? "album" : "albums"}
        </p>
      )}
    </div>
  );
}

// ─── Playlist Card ────────────────────────────────────────────

function PlaylistCard({ playlist }: { playlist: PlaylistListItem }) {
  return (
    <Link
      to="/playlists/$playlistId"
      params={{ playlistId: playlist.id }}
      className="group block cursor-pointer min-w-0"
    >
      <div
        className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 shadow-md"
        style={{
          background: playlist.coverArtUrl
            ? undefined
            : generateAlbumGradient(playlist.name, ""),
        }}
      >
        {playlist.coverArtUrl ? (
          <img
            src={playlist.coverArtUrl}
            alt={playlist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ListMusic className="w-8 h-8 text-white/15" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg translate-y-2.5 group-hover:translate-y-0 transition-transform duration-200">
            <Play
              className="w-4 h-4 text-primary-foreground ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
      </div>
      <p className="text-[0.8125rem] font-semibold text-foreground truncate leading-snug">
        {playlist.name}
      </p>
      <p className="text-[0.72rem] text-muted-foreground mt-0.5">
        {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
      </p>
    </Link>
  );
}

// ─── Add-to-playlist dropdown ─────────────────────────────────

function PlaylistCheckboxRow({
  trackId,
  playlist,
  dropdownOpen,
}: {
  trackId: string;
  playlist: PlaylistListItem;
  dropdownOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["playlist", playlist.id],
    queryFn: async (): Promise<PlaylistDetail> => {
      const res = await fetch(`/api/playlists/${playlist.id}`);
      if (!res.ok) throw new Error("Failed to fetch playlist");
      return res.json();
    },
    enabled: dropdownOpen,
    staleTime: 60_000,
  });

  const isMember = detail?.tracks.some((t) => t.trackId === trackId) ?? false;
  const entryId = detail?.tracks.find((t) => t.trackId === trackId)?.entryId;

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (!res.ok) throw new Error("Failed to add track");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.id] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!entryId) return;
      const res = await fetch(
        `/api/playlists/${playlist.id}/tracks/${entryId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove track");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.id] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });

  const toggle = () => {
    if (isMember && entryId) {
      removeMutation.mutate();
    } else if (!isMember) {
      addMutation.mutate();
    }
  };

  return (
    <button
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 w-full text-left transition-colors",
        hovered ? "bg-white/5" : "bg-transparent",
      )}
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors",
          isMember
            ? "bg-primary border-primary"
            : "bg-transparent border-white/25",
        )}
      >
        {isMember && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
      <span
        className={cn(
          "text-[0.8125rem] truncate transition-colors",
          isMember ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {playlist.name}
      </span>
    </button>
  );
}

function AddToPlaylistDropdown({
  trackId,
  open,
  onOpenChange,
}: {
  trackId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: playlistsData } = useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !dropRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      onOpenChange(false);
      return;
    }
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 44 + (playlistsData?.items.length ?? 0) * 40;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > dropH + 8 ? rect.bottom + 4 : rect.top - dropH - 4;
    const left = Math.min(rect.right - 200, window.innerWidth - 212);
    setDropStyle({ position: "fixed", top, left, width: 200, zIndex: 300 });
    onOpenChange(true);
  };

  const playlists = playlistsData?.items ?? [];

  return (
    <>
      <button
        ref={btnRef}
        title="Add to playlist"
        onClick={handleOpen}
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-white/20 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={dropRef}
            style={{ ...dropStyle, background: "oklch(0.22 0 0)" }}
            className="rounded-xl border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/10">
              <span className="text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Add to playlist
              </span>
            </div>
            {playlists.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No playlists yet
              </p>
            ) : (
              playlists.map((pl) => (
                <PlaylistCheckboxRow
                  key={pl.id}
                  trackId={trackId}
                  playlist={pl}
                  dropdownOpen={open}
                />
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// ─── Track Row + List ─────────────────────────────────────────

function TrackRow({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
}: {
  track: TrackListItem;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const active = hovered || dropOpen;

  return (
    <div
      className={cn(
        "grid items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
        "grid-cols-[2rem_2.25rem_1fr_1fr_1fr_1.5rem_4rem]",
        active ? "bg-white/5" : "bg-transparent",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onPlay}
    >
      {/* # */}
      <div
        className="flex items-center justify-center text-[0.8rem] tabular-nums"
        style={{ color: isActive ? "var(--color-primary)" : undefined }}
      >
        {active ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="text-foreground"
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
          </button>
        ) : isActive && isPlaying ? (
          <Pause
            className="w-3.5 h-3.5"
            fill="currentColor"
            style={{ color: "var(--color-primary)" }}
          />
        ) : (
          <span className="text-muted-foreground">{index + 1}</span>
        )}
      </div>

      {/* Art */}
      <div
        className="w-9 h-9 rounded overflow-hidden flex items-center justify-center shrink-0"
        style={{
          background: generateAlbumGradient(
            track.albumTitle ?? track.title,
            track.artistName,
          ),
        }}
      >
        {track.coverArtUrl ? (
          <img
            src={track.coverArtUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music2 className="w-3.5 h-3.5 text-white/20" />
        )}
      </div>

      {/* Title */}
      <div
        className="truncate text-[0.875rem]"
        style={{
          color: isActive ? "var(--color-primary)" : undefined,
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {track.title}
      </div>

      {/* Album */}
      <div className="truncate text-[0.8rem] text-muted-foreground">
        {track.albumTitle ?? "—"}
      </div>

      {/* Artist */}
      <div className="truncate text-[0.8rem] text-muted-foreground">
        {track.artistName}
      </div>

      {/* + playlist */}
      <div
        className={cn(
          "flex items-center justify-center transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      >
        <AddToPlaylistDropdown
          trackId={track.id}
          open={dropOpen}
          onOpenChange={setDropOpen}
        />
      </div>

      {/* Duration */}
      <div className="text-[0.8rem] text-muted-foreground tabular-nums text-right">
        {track.durationSeconds ? formatTime(track.durationSeconds) : "—"}
      </div>
    </div>
  );
}

function TrackList({
  tracks,
  activeTrackId,
  isPlaying,
  onPlayTrack,
}: {
  tracks: TrackListItem[];
  activeTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (index: number) => void;
}) {
  return (
    <div>
      {/* Header */}
      <div className="grid items-center gap-3 px-2 pb-2 border-b border-border mb-1 grid-cols-[2rem_2.25rem_1fr_1fr_1fr_1.5rem_4rem]">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground text-center">
          #
        </div>
        <div />
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Title
        </div>
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Album
        </div>
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Artist
        </div>
        <div />
        <div className="flex justify-end text-muted-foreground">
          <Clock className="w-3 h-3" />
        </div>
      </div>

      {tracks.map((track, i) => (
        <TrackRow
          key={track.id}
          track={track}
          index={i}
          isActive={track.id === activeTrackId}
          isPlaying={isPlaying ?? false}
          onPlay={() => onPlayTrack(i)}
        />
      ))}
    </div>
  );
}

// ─── Section header (search results) ─────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-3 mt-8 first:mt-0">
      <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-[0.75rem] text-muted-foreground/60">{count}</span>
    </div>
  );
}

// ─── Library Page ─────────────────────────────────────────────

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

  // All data pre-fetched
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

  // Album count by artist id
  const albumCountByArtistId = useMemo(() => {
    const map = new Map<string, number>();
    albumsQuery.data?.items.forEach((a) =>
      map.set(a.artistId, (map.get(a.artistId) ?? 0) + 1),
    );
    return map;
  }, [albumsQuery.data]);

  // Total duration
  const totalDurationSeconds = useMemo(
    () =>
      tracksQuery.data?.items.reduce(
        (s, t) => s + (t.durationSeconds ?? 0),
        0,
      ) ?? 0,
    [tracksQuery.data],
  );

  // Playback
  const { data: playbackSession } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async () => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch session");
      const json = await res.json();
      return json;
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

  // Count label
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

  // Playlist search (client-side)
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

      {/* ─── Search mode ─── */}
      {isSearchMode ? (
        searchResultsQuery.isFetching ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : (
          <div>
            {/* Playlists (client-side filtered) */}
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

            {/* Artists */}
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

            {/* Albums */}
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

            {/* Tracks first */}
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
        /* ─── Tab content ─── */
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
      {newPlaylistOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewPlaylistOpen(false);
          }}
        >
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold mb-4">New playlist</h2>
            <input
              autoFocus
              placeholder="Playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPlaylistName.trim())
                  createPlaylistMutation.mutate(newPlaylistName.trim());
                if (e.key === "Escape") setNewPlaylistOpen(false);
              }}
              className="w-full bg-transparent border border-border rounded-lg text-sm px-3 py-2 h-9 outline-none focus:border-white/25 text-foreground placeholder:text-muted-foreground mb-4 transition-colors"
            />
            <div className="flex justify-end gap-2">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
