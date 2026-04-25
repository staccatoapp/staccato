import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import type { AlbumListItem, LibrarySearchResults } from "@staccato/shared";
import { formatTime, generateAlbumGradient } from "@/lib/music";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/library/")({
  component: LibraryPage,
});

function AlbumCard({ album }: { album: AlbumListItem }) {
  return (
    <Link
      to="/library/albums/$albumId"
      params={{ albumId: album.id }}
      className="group block cursor-pointer"
    >
      <div
        className="relative aspect-square w-full rounded-md overflow-hidden mb-3 shadow-sm"
        style={{
          background: album.coverArtUrl
            ? undefined
            : generateAlbumGradient(album.title, album.artistName),
        }}
      >
        {album.coverArtUrl ? (
          <img
            src={album.coverArtUrl}
            alt={album.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Music2 className="w-10 h-10 text-white/20" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
            <svg
              className="w-5 h-5 text-primary-foreground ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="space-y-0.5 px-0.5">
        <p className="text-sm font-semibold text-foreground truncate leading-snug">
          {album.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {album.artistName}
          {album.releaseYear && (
            <span className="before:content-['·'] before:mx-1">
              {album.releaseYear}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

function AlbumCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full rounded-md mb-3" />
      <div className="space-y-1.5 px-0.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["albums"],
    queryFn: async () => {
      const res = await fetch("/api/library/albums?limit=200");
      if (!res.ok) throw new Error("Failed to fetch albums");
      return res.json() as Promise<{ items: AlbumListItem[]; total: number }>;
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["library-search", debouncedSearch],
    queryFn: async (): Promise<LibrarySearchResults> => {
      const res = await fetch(
        `/api/library/search?q=${encodeURIComponent(debouncedSearch)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  const isSearchMode = debouncedSearch.length >= 2;
  const hasResults =
    searchResults &&
    (searchResults.artists.length > 0 ||
      searchResults.albums.length > 0 ||
      searchResults.tracks.length > 0);

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Albums</h1>
        {!isSearchMode && data && (
          <span className="text-sm text-muted-foreground">
            {data.total} albums
          </span>
        )}
      </div>

      <Input
        placeholder="Search library..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm mb-6"
      />

      {isSearchMode ? (
        isSearching ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : !hasResults ? (
          <p className="text-sm text-muted-foreground">
            No results for "{debouncedSearch}"
          </p>
        ) : (
          <div className="space-y-8">
            {searchResults.artists.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Artists
                </h2>
                <div className="space-y-1">
                  {searchResults.artists.map((artist) => (
                    <div
                      key={artist.id}
                      className="px-3 py-2 rounded-md hover:bg-accent/50"
                    >
                      <p className="text-sm font-medium">{artist.name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {searchResults.albums.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Albums
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                  {searchResults.albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              </section>
            )}

            {searchResults.tracks.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Tracks
                </h2>
                <div className="space-y-1">
                  {searchResults.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="grid grid-cols-[2rem_1fr_1fr_4rem] items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50"
                    >
                      {track.coverArtUrl ? (
                        <img
                          src={track.coverArtUrl}
                          className="w-6 h-6 rounded"
                          alt=""
                        />
                      ) : (
                        <Music2 className="w-4 h-4 text-muted-foreground" />
                      )}
                      <p className="text-sm font-medium truncate">
                        {track.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.albumTitle ?? track.artistName}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {track.durationSeconds
                          ? formatTime(track.durationSeconds)
                          : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : (
        <>
          {isError && (
            <p className="text-sm text-destructive">Failed to load albums.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
            {isLoading
              ? Array.from({ length: 18 }).map((_, i) => (
                  <AlbumCardSkeleton key={i} />
                ))
              : data?.items.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
          </div>
        </>
      )}
    </div>
  );
}
