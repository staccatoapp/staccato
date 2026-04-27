import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Play, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AlbumDetail, PlaylistListItem } from "@staccato/shared";
import { AlbumHeader } from "@/components/music/AlbumHeader";
import { AlbumDetailSkeleton } from "@/components/music/AlbumDetailSkeleton";
import { TrackList } from "@/components/music/TrackList";

export const Route = createFileRoute("/library/albums/$albumId")({
  component: AlbumDetailPage,
});

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secondsRemainder = seconds % 60;
  return `${minutes}:${secondsRemainder.toString().padStart(2, "0")}`;
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

function AlbumDetailPage() {
  const { albumId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: playlistsData } = useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: async ({
      playlistId,
      trackIds,
    }: {
      playlistId: string;
      trackIds: string[];
    }) => {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds }),
      });
      if (!res.ok) throw new Error("Failed to add to playlist");
    },
    onSuccess: (_data, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
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
  const hasPlaylists = (playlistsData?.items.length ?? 0) > 0;

  return (
    <div>
      <AlbumHeader
        title={album.title}
        artistName={album.artistName}
        releaseYear={album.releaseYear}
        coverArtUrl={album.coverArtUrl}
        trackCount={tracks.length}
        totalSeconds={totalSeconds}
        backLink={<BackLink />}
      >
        <Button
          onClick={() =>
            playMutation.mutate({
              trackIds: tracks.map((t) => t.id),
              startIndex: 0,
            })
          }
          disabled={playMutation.isPending}
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          Play Album
        </Button>
        {hasPlaylists && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({
                variant: "outline",
                className: "gap-2",
              })}
            >
              <Plus className="w-4 h-4" />
              Add to Playlist
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {playlistsData?.items.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() =>
                    addToPlaylistMutation.mutate({
                      playlistId: p.id,
                      trackIds: tracks.map((t) => t.id),
                    })
                  }
                >
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </AlbumHeader>

      <div className="px-6 pb-8">
        <TrackList
          tracks={tracks.map((t) => ({
            key: t.id,
            num: String(t.trackNumber ?? "—"),
            title: t.title,
            formattedDuration:
              t.durationSeconds != null
                ? formatDuration(t.durationSeconds)
                : "—",
          }))}
          onPlayTrack={(index) =>
            playMutation.mutate({
              trackIds: tracks.map((t) => t.id),
              startIndex: index,
            })
          }
          extraAction={
            hasPlaylists
              ? (index) =>
                  (() => {
                    const track = tracks[index];
                    if (!track) return null;
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Add ${track.title} to playlist`}
                        >
                          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {playlistsData?.items.map((p) => (
                            <DropdownMenuItem
                              key={p.id}
                              onClick={() =>
                                addToPlaylistMutation.mutate({
                                  playlistId: p.id,
                                  trackIds: [track.id],
                                })
                              }
                            >
                              {p.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()
              : undefined
          }
        />
      </div>
    </div>
  );
}
