import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Clock, Music2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlbumDetail } from "@staccato/shared";
import { generateAlbumGradient } from "@/lib/music";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/library/albums/$albumId")({
  component: AlbumDetailPage,
});

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secondsRemainder = seconds % 60;
  return `${minutes}:${secondsRemainder.toString().padStart(2, "0")}`;
}

function formatTotalDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

function BackLink() {
  return (
    <Link
      to="/library"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      Library
    </Link>
  );
}

function AlbumDetailSkeleton() {
  return (
    <div>
      <div className="px-6 pt-6 pb-8 bg-muted/30">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-6 mt-6 items-end">
          <Skeleton className="w-44 h-44 shrink-0 rounded-md" />
          <div className="space-y-3 pb-1 flex-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>
      <div className="px-6 pt-4 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

function AlbumDetailPage() {
  const { albumId } = Route.useParams();
  const queryClient = useQueryClient();

  const playMutation = useMutation({
    mutationFn: async ({ trackIds, startIndex }: { trackIds: string[]; startIndex: number }) => {
      const res = await fetch("/api/playback/session/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds, startIndex }),
      });
      if (!res.ok) throw new Error("Failed to start playback");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playback-session"] });
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["album", albumId],
    queryFn: async () => {
      const res = await fetch(`/api/library/albums/${albumId}`);
      if (!res.ok) throw new Error("Failed to fetch album");
      return res.json() as Promise<AlbumDetail>;
    },
  });

  if (isLoading) return <AlbumDetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-6">
        <BackLink />
        <p className="text-sm text-destructive mt-4">Failed to load album.</p>
      </div>
    );
  }

  const { album, tracks } = data;
  const totalSeconds = tracks.reduce(
    (sum, t) => sum + (t.durationSeconds ?? 0),
    0,
  );
  const gradient = generateAlbumGradient(album.title, album.artistName);

  return (
    <div>
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-50 blur-3xl scale-150"
          style={{ background: gradient }}
          aria-hidden="true"
        />
        <div className="relative px-6 pt-6 pb-8">
          <BackLink />
          <div className="flex gap-6 mt-6 items-end">
            <div
              className="w-44 h-44 shrink-0 rounded-md shadow-2xl overflow-hidden"
              style={{ background: album.coverArtUrl ? undefined : gradient }}
            >
              {album.coverArtUrl ? (
                <img
                  src={album.coverArtUrl}
                  alt={album.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 className="w-12 h-12 text-white/20" />
                </div>
              )}
            </div>

            <div className="min-w-0 pb-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Album
              </p>
              <h1 className="text-3xl font-bold tracking-tight leading-tight text-foreground mb-2 line-clamp-2">
                {album.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {album.artistName}
                {album.releaseYear && (
                  <span className="before:content-['·'] before:mx-1.5">
                    {album.releaseYear}
                  </span>
                )}
                <span className="before:content-['·'] before:mx-1.5">
                  {tracks.length} tracks
                </span>
                {totalSeconds > 0 && (
                  <span className="before:content-['·'] before:mx-1.5">
                    {formatTotalDuration(totalSeconds)}
                  </span>
                )}
              </p>
              <div className="mt-4">
                <Button
                  onClick={() => playMutation.mutate({ trackIds: tracks.map((t) => t.id), startIndex: 0 })}
                  disabled={playMutation.isPending}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  Play Album
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8">
        <div className="grid grid-cols-[2rem_1fr_4rem_2rem] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
          <span className="text-right">#</span>
          <span>Title</span>
          <span className="flex justify-end">
            <Clock className="w-3.5 h-3.5" />
          </span>
          <span />
        </div>

        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="group grid grid-cols-[2rem_1fr_4rem_2rem] gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-accent/50 transition-colors"
          >
            <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
              {track.trackNumber ?? "—"}
            </span>
            <span className="text-foreground truncate self-center">
              {track.title}
            </span>
            <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
              {track.durationSeconds != null
                ? formatDuration(track.durationSeconds)
                : "—"}
            </span>
            <button
              onClick={() => playMutation.mutate({ trackIds: tracks.map((t) => t.id), startIndex: index })}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center"
              aria-label={`Play ${track.title}`}
            >
              <Play className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
