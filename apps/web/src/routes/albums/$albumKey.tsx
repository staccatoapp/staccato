import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Clock,
  Download,
  Play,
  Plus,
  RotateCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  PlaylistListItem,
  UnifiedAlbumDetail,
} from "@staccato/shared";
import { AlbumHeader } from "@/components/music/AlbumHeader";
import { AlbumDetailSkeleton } from "@/components/music/AlbumDetailSkeleton";
import { TrackList } from "@/components/music/TrackList";
import { toUiStatus, useDownloads } from "@/hooks/useDownloads";
import {
  useRequestDownload,
  useRetryDownload,
} from "@/hooks/useRequestDownload";

export const Route = createFileRoute("/albums/$albumKey")({
  component: AlbumDetailPage,
});

function formatDurationSeconds(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function BackLink({ source }: { source: "local" | "external" }) {
  const to = source === "external" ? "/explore" : "/library";
  const label = source === "external" ? "Explore" : "Library";
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}

function AlbumDetailPage() {
  const { albumKey } = Route.useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["album", albumKey],
    queryFn: async (): Promise<UnifiedAlbumDetail> => {
      const res = await fetch(`/api/albums/${albumKey}`);
      if (!res.ok) throw new Error("Failed to fetch album");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) return <AlbumDetailSkeleton />;
  if (isError || !data) {
    return (
      <div className="p-6">
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
        <p className="text-sm text-destructive mt-4">Failed to load album.</p>
      </div>
    );
  }

  return data.source === "local" ? (
    <LocalAlbumView data={data} />
  ) : (
    <ExternalAlbumView data={data} />
  );
}

function LocalAlbumView({
  data,
}: {
  data: Extract<UnifiedAlbumDetail, { source: "local" }>;
}) {
  const queryClient = useQueryClient();
  const { album, tracks } = data;

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

  const totalSeconds = tracks.reduce(
    (sum, t) => sum + (t.durationSeconds ?? 0),
    0,
  );
  const hasPlaylists = (playlistsData?.items.length ?? 0) > 0;
  const discCount = new Set(tracks.map((t) => t.discNumber ?? 1)).size;

  return (
    <div>
      <AlbumHeader
        title={album.title}
        artistName={album.artistName}
        releaseYear={album.releaseYear}
        coverArtUrl={album.coverArtUrl}
        trackCount={tracks.length}
        totalSeconds={totalSeconds}
        backLink={<BackLink source="local" />}
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
            num:
              discCount > 1
                ? `${t.discNumber ?? 1}-${t.trackNumber ?? "—"}`
                : String(t.trackNumber ?? "—"),
            title: t.title,
            formattedDuration: formatDurationSeconds(t.durationSeconds),
          }))}
          onPlayTrack={(index) =>
            playMutation.mutate({
              trackIds: tracks.map((t) => t.id),
              startIndex: index,
            })
          }
          extraAction={
            hasPlaylists
              ? (index) => {
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
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

function ExternalAlbumView({
  data,
}: {
  data: Extract<UnifiedAlbumDetail, { source: "external" }>;
}) {
  const { album, tracks } = data;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  const { byReleaseGroup } = useDownloads();
  const requestDownload = useRequestDownload();
  const retryDownload = useRetryDownload();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingMbid(null);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  function handlePreview(
    recordingMbid: string,
    artistName: string,
    title: string,
  ) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingMbid === recordingMbid) {
      audio.pause();
      setPlayingMbid(null);
      return;
    }
    window.dispatchEvent(new Event("staccato:preview-start"));
    audio.src = `/api/preview/${recordingMbid}/stream?${new URLSearchParams({ artistName, trackTitle: title })}`;
    audio.play().catch(() => {});
    setPlayingMbid(recordingMbid);
  }

  const totalSeconds = tracks.reduce(
    (sum, t) => sum + Math.round((t.durationMs ?? 0) / 1000),
    0,
  );
  const discCount = new Set(tracks.map((t) => t.discPosition)).size;

  const download = byReleaseGroup.get(album.releaseGroupMbid);
  const downloadStatus = download ? toUiStatus(download.status) : null;
  const canAdd = !!album.artistMbid;

  function addAlbum() {
    if (!album.artistMbid) return;
    requestDownload.mutate({
      releaseGroupMbid: album.releaseGroupMbid,
      artistMbid: album.artistMbid,
      artistName: album.artistName,
      albumTitle: album.title,
    });
  }

  function retryAlbum() {
    if (!album.artistMbid || !download) return;
    retryDownload.mutate({
      requestId: download.id,
      payload: {
        releaseGroupMbid: album.releaseGroupMbid,
        artistMbid: album.artistMbid,
        artistName: album.artistName,
        albumTitle: album.title,
      },
    });
  }

  return (
    <div>
      <AlbumHeader
        title={album.title}
        artistName={album.artistName}
        releaseYear={album.releaseYear}
        coverArtUrl={album.coverArtUrl}
        trackCount={tracks.length}
        totalSeconds={totalSeconds}
        backLink={<BackLink source="external" />}
      >
        <ExternalAlbumDownloadAction
          status={downloadStatus}
          canAdd={canAdd}
          onAdd={addAlbum}
          onRetry={retryAlbum}
        />
      </AlbumHeader>

      <div className="px-6 pb-8">
        <TrackList
          tracks={tracks.map((t) => ({
            key: t.recordingMbid,
            num:
              discCount > 1
                ? `${t.discPosition}-${t.trackPosition}`
                : String(t.trackPosition),
            title: t.title,
            formattedDuration: formatDurationSeconds(
              t.durationMs == null ? null : Math.round(t.durationMs / 1000),
            ),
          }))}
          onPreviewTrack={(index) => {
            const t = tracks[index];
            if (!t) return;
            handlePreview(t.recordingMbid, album.artistName, t.title);
          }}
          isPreviewPlaying={(index) => {
            const t = tracks[index];
            return t ? t.recordingMbid === playingMbid : false;
          }}
        />
      </div>
      <audio ref={audioRef} />
    </div>
  );
}

type ExternalAlbumStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | null;

function ExternalAlbumDownloadAction({
  status,
  canAdd,
  onAdd,
  onRetry,
}: {
  status: ExternalAlbumStatus;
  canAdd: boolean;
  onAdd: () => void;
  onRetry: () => void;
}) {
  if (status === "completed") {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Check className="w-4 h-4" />
        In library
      </Button>
    );
  }
  if (status === "pending") {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Clock className="w-4 h-4" />
        Queued
      </Button>
    );
  }
  if (status === "downloading") {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Download className="w-4 h-4" />
        Downloading
      </Button>
    );
  }
  if (status === "failed") {
    return (
      <Button variant="destructive" onClick={onRetry} className="gap-2">
        <RotateCw className="w-4 h-4" />
        Failed — retry
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={onAdd}
      disabled={!canAdd}
      title={canAdd ? undefined : "Insufficient metadata"}
      className="gap-2"
    >
      <Plus className="w-4 h-4" />
      Add to library
    </Button>
  );
}
