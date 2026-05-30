import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, Play, Plus } from "lucide-react";
import {
  type PlaylistListItem,
  PlaylistListResponseSchema,
  type RecommendedPlaylistTrack,
} from "@staccato/shared";
import { generateAlbumGradient } from "@/lib/music";
import { useRecommendedPlaylists } from "@/hooks/useRecommendations";
import { usePreviewAudio } from "@/hooks/usePreviewAudio";
import {
  useRequestDownload,
  useRetryDownload,
} from "@/hooks/useRequestDownload";
import { useRequestDownloadDialog } from "@/hooks/useRequestDownloadDialog";
import { RequestDownloadDialog } from "@/components/downloads/RequestDownloadDialog";
import { toUiStatus, useDownloads } from "@/hooks/useDownloads";
import {
  RecommendedTrackListHeader,
  RecommendedTrackRow,
  type TrackRowData,
} from "@/components/explore/RecommendedTrackRow";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/explore/recommendations/$recId")({
  component: RecommendationDetailPage,
});

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")";

function fmtTotal(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function RecommendationDetailPage() {
  const { recId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: playlists, isLoading } = useRecommendedPlaylists();

  const { audioRef, playingMbid, handlePreview } = usePreviewAudio();
  const { byReleaseGroup } = useDownloads();
  const requestDialog = useRequestDownloadDialog();
  const bulkRequest = useRequestDownload();
  const retryDownload = useRetryDownload();

  const gradient = generateAlbumGradient(recId, "recommendation");

  const playlist =
    !playlists ||
    (playlists.status !== "ready" && playlists.status !== "error") ||
    !playlists.data
      ? null
      : (playlists.data.find((p) => p.id === recId) ?? null);

  const tracks: RecommendedPlaylistTrack[] = playlist?.tracks ?? [];

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleTracks = tracks.filter(
    (t) => !t.recordingMbid || !dismissed.has(t.recordingMbid),
  );
  const allInLibrary =
    visibleTracks.length > 0 &&
    visibleTracks.every((t) => t.inLibrary && t.localTrackId);
  const totalDurationMs = tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0);

  const { data: playlistsData } = useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return PlaylistListResponseSchema.parse(await res.json());
    },
    enabled: allInLibrary,
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

  function openAddAllDialog() {
    if (!playlist) return;
    requestDialog.openBulk({
      subject: "playlist",
      subjectName: playlist.name,
      run: async ({ qualityProfileId }) => {
        const seen = new Set<string>();
        for (const t of visibleTracks) {
          if (t.inLibrary) continue;
          if (!t.releaseGroupMbid || !t.artistMbid || !t.artistName) continue;
          if (byReleaseGroup.has(t.releaseGroupMbid)) continue;
          if (seen.has(t.releaseGroupMbid)) continue;
          seen.add(t.releaseGroupMbid);
          await bulkRequest.mutateAsync({
            releaseGroupMbid: t.releaseGroupMbid,
            artistMbid: t.artistMbid,
            artistName: t.artistName,
            albumTitle: t.albumTitle,
            ...(qualityProfileId !== null && { qualityProfileId }),
          });
        }
      },
    });
  }

  function addOne(track: RecommendedPlaylistTrack) {
    if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName)
      return;
    requestDialog.openSingle({
      subject: "track",
      subjectName: track.title,
      payload: {
        releaseGroupMbid: track.releaseGroupMbid,
        artistMbid: track.artistMbid,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
      },
    });
  }

  function retryOne(track: RecommendedPlaylistTrack, requestId: string) {
    if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName)
      return;
    retryDownload.mutate({
      requestId,
      payload: {
        releaseGroupMbid: track.releaseGroupMbid,
        artistMbid: track.artistMbid,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
      },
    });
  }

  const localTrackIds: string[] = visibleTracks
    .map((t) => t.localTrackId)
    .filter((id): id is string => !!id);

  const hasPlaylists = (playlistsData?.items.length ?? 0) > 0;

  return (
    <div className="pb-24">
      <audio ref={audioRef} />
      {/* Hero */}
      <div
        className="relative px-7 pt-9 pb-7 overflow-hidden"
        style={{ background: gradient }}
      >
        {/* Noise */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: NOISE_SVG,
            backgroundSize: "cover",
            opacity: 0.4,
          }}
        />
        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, oklch(0.145 0 0))",
          }}
        />

        {/* Back link */}
        <Link
          to="/explore"
          className="relative inline-flex items-center gap-1.5 pb-5 text-[0.8rem] font-medium text-white/75 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Explore
        </Link>

        {/* Hero content */}
        <div className="relative">
          <span
            className="block text-[0.65rem] font-bold tracking-[0.1em] uppercase mb-2"
            style={{ color: "oklch(0.72 0.18 280)" }}
          >
            Recommended for you
          </span>
          <h1
            className="text-[2rem] font-extrabold text-white tracking-[-0.03em] leading-[1.1] mb-2"
            style={{ textShadow: "0 2px 8px oklch(0 0 0 / 40%)" }}
          >
            {playlist?.name ?? "Unknown Playlist"}
          </h1>
          <p
            className="text-sm mb-5"
            style={{
              color: "oklch(1 0 0 / 70%)",
              textShadow: "0 1px 4px oklch(0 0 0 / 40%)",
            }}
          >
            Recommendations from ListenBrainz
          </p>
          <p
            className="text-[0.8rem] mb-5"
            style={{ color: "oklch(1 0 0 / 55%)" }}
          >
            {tracks.length} tracks · {fmtTotal(totalDurationMs)}
          </p>

          {/* Actions */}
          {allInLibrary ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  playMutation.mutate({
                    trackIds: localTrackIds,
                    startIndex: 0,
                  })
                }
                disabled={playMutation.isPending || localTrackIds.length === 0}
                className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[22px] bg-white text-[oklch(0.15_0_0)] text-sm font-semibold disabled:opacity-60"
                style={{ boxShadow: "0 2px 12px oklch(0 0 0 / 35%)" }}
              >
                <Play className="w-3.5 h-3.5" />
                Play
              </button>
              {hasPlaylists && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={buttonVariants({
                      variant: "outline",
                      className: "gap-2 h-[38px]",
                    })}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Playlist
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {playlistsData?.items.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() =>
                          addToPlaylistMutation.mutate({
                            playlistId: p.id,
                            trackIds: localTrackIds,
                          })
                        }
                      >
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <span
                className="inline-flex items-center gap-1.5 text-[0.75rem]"
                style={{ color: "oklch(1 0 0 / 55%)" }}
              >
                <Check className="w-3 h-3" />
                All tracks in your library
              </span>
            </div>
          ) : (
            <button
              onClick={openAddAllDialog}
              className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[22px] bg-white text-[oklch(0.15_0_0)] text-sm font-semibold"
              style={{ boxShadow: "0 2px 12px oklch(0 0 0 / 35%)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add all to library
            </button>
          )}
        </div>
      </div>

      {/* Track list */}
      <div className="px-4 pt-2">
        <RecommendedTrackListHeader />

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Loading…
          </p>
        ) : visibleTracks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {tracks.length === 0 ? "No tracks found." : "All tracks dismissed."}
          </p>
        ) : (
          visibleTracks.map((track, i) => {
            const rowData: TrackRowData = {
              recordingMbid: track.recordingMbid,
              title: track.title,
              artistName: track.artistName ?? "Unknown Artist",
              albumTitle: track.albumTitle ?? "—",
              durationMs: track.durationMs,
              coverArtUrl: track.coverArtUrl,
              inLibrary: track.inLibrary,
            };
            const download = track.releaseGroupMbid
              ? byReleaseGroup.get(track.releaseGroupMbid)
              : undefined;
            const downloadStatus = download
              ? toUiStatus(download.status)
              : null;
            const addDisabledReason =
              !track.releaseGroupMbid || !track.artistMbid || !track.artistName
                ? "Insufficient metadata"
                : null;
            return (
              <RecommendedTrackRow
                key={track.recordingMbid ?? `track-${i}`}
                track={rowData}
                index={i}
                isPlaying={
                  !!track.recordingMbid && playingMbid === track.recordingMbid
                }
                inLibrary={track.inLibrary}
                downloadStatus={downloadStatus}
                addDisabledReason={addDisabledReason}
                onPlay={(t) => {
                  if (t.recordingMbid) {
                    handlePreview(t.recordingMbid, t.artistName ?? "", t.title);
                  }
                }}
                onAddToLibrary={() => addOne(track)}
                onRetry={
                  download ? () => retryOne(track, download.id) : undefined
                }
                onDismiss={() => {
                  if (track.recordingMbid) {
                    setDismissed((s) => new Set(s).add(track.recordingMbid!));
                  }
                }}
              />
            );
          })
        )}
      </div>

      <RequestDownloadDialog {...requestDialog.dialogProps} />
    </div>
  );
}
