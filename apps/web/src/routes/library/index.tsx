import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import type { AlbumListItem } from "@staccato/shared";
import { generateAlbumGradient } from "@/lib/music";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["albums"],
    queryFn: async () => {
      const res = await fetch("/api/library/albums?limit=200");
      if (!res.ok) throw new Error("Failed to fetch albums");
      return res.json() as Promise<{ items: AlbumListItem[]; total: number }>;
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Albums</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} albums
          </span>
        )}
      </div>

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
    </div>
  );
}
