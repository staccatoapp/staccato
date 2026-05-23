import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Clock,
  Download,
  MoreHorizontal,
  Play,
  Plus,
  RotateCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  PlaylistListItem,
  ServerSettings,
  UnifiedAlbumDetail,
} from "@staccato/shared";
import { AlbumHeader } from "@/components/music/AlbumHeader";
import { AlbumDetailSkeleton } from "@/components/music/AlbumDetailSkeleton";
import { TrackList } from "@/components/music/TrackList";
import { FeaturedArtists } from "@/components/music/FeaturedArtists";
import { IdentifyAlbumDialog } from "@/components/music/IdentifyAlbumDialog";
import { toUiStatus, useDownloads } from "@/hooks/useDownloads";
import { useRetryDownload } from "@/hooks/useRequestDownload";
import { useRequestDownloadDialog } from "@/hooks/useRequestDownloadDialog";
import { RequestDownloadDialog } from "@/components/downloads/RequestDownloadDialog";

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
  const { albumKey } = Route.useParams();
  const { album, tracks } = data;
  const [identifyOpen, setIdentifyOpen] = useState(false);

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
  const resolutionDone = album.pendingTrackCount === 0;
  const showBanner =
    resolutionDone &&
    (album.confidenceScore === null || album.confidenceScore < threshold);
  const pct =
    album.confidenceScore !== null && album.confidenceScore !== undefined
      ? Math.round(album.confidenceScore * 100)
      : null;

  const confirmMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/albums/${albumKey}/confirm-match`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to confirm match");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["album", albumKey] });
      toast.success("Match confirmed");
    },
    onError: () => toast.error("Failed to confirm match"),
  });

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
        artists={album.artists}
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
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Album actions"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setIdentifyOpen(true)}>
              <Search className="w-4 h-4" />
              Identify
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      {showBanner && (
        <div className="mx-6 mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-foreground">
                {pct !== null
                  ? "Low confidence metadata match"
                  : "No metadata match"}
              </span>
              {pct !== null && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[0.65rem] px-1.5 py-0 hover:bg-amber-500/20">
                  {pct}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {pct !== null
                ? `Staccato matched these files to "${album.title}" by ${album.artistName}, but isn't sure. Re-identify to pick a different release, or confirm if this looks right.`
                : `Staccato couldn't match these files to a MusicBrainz release. Re-identify to search manually.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIdentifyOpen(true)}
            >
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Re-identify
            </Button>
            {pct !== null && (
              <Button
                size="sm"
                variant="outline"
                disabled={confirmMatchMutation.isPending}
                onClick={() => confirmMatchMutation.mutate()}
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Confirm match
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="px-6 pb-8">
        <TrackList
          tracks={tracks.map((t) => ({
            key: t.id,
            num:
              discCount > 1
                ? `${t.discNumber ?? 1}-${t.trackNumber ?? "—"}`
                : String(t.trackNumber ?? "—"),
            title: t.title,
            titleSuffix: (
              <FeaturedArtists
                credits={t.artists}
                className="text-muted-foreground"
              />
            ),
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

      <IdentifyAlbumDialog
        open={identifyOpen}
        onOpenChange={setIdentifyOpen}
        albumKey={albumKey}
        album={{
          id: album.id,
          title: album.title,
          artistName: album.artistName,
          releaseMbid: album.releaseMbid,
          releaseGroupMbid: album.releaseGroupMbid,
        }}
        currentTracks={tracks.map((t) => ({
          title: t.title,
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          durationSeconds: t.durationSeconds,
        }))}
      />
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
  const requestDialog = useRequestDownloadDialog();
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
    requestDialog.openSingle({
      subject: "release",
      subjectName: album.title,
      payload: {
        releaseGroupMbid: album.releaseGroupMbid,
        artistMbid: album.artistMbid,
        artistName: album.artistName,
        albumTitle: album.title,
      },
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
        artists={album.artists}
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
      <RequestDownloadDialog {...requestDialog.dialogProps} />
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
