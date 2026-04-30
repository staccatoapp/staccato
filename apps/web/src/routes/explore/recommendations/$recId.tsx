import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Clock, Plus } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";
import { useRecommendedPlaylists } from "@/hooks/useRecommendations";
import {
  RecommendedTrackListHeader,
  RecommendedTrackRow,
  type TrackRowData,
} from "@/components/explore/RecommendedTrackRow";

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
  const { data: playlists, isLoading } = useRecommendedPlaylists();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  const gradient = generateAlbumGradient(recId, "recommendation");

  const playlist =
    !playlists || "error" in playlists
      ? null
      : (playlists.find((p) => p.id === recId) ?? null);

  const tracks: TrackRowData[] = (playlist?.tracks ?? []).map((t) => ({
    recordingMbid: t.recordingMbid,
    title: t.title,
    artistName: t.artistName ?? "Unknown Artist",
    albumTitle: t.albumTitle ?? "—",
    durationMs: t.durationMs,
    coverArtUrl: t.coverArtUrl,
    inLibrary: t.inLibrary,
  }));

  const [trackStates, setTrackStates] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function handlePreview(recordingMbid: string, artistName: string, title: string) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingMbid === recordingMbid) {
      audio.pause();
      setPlayingMbid(null);
      return;
    }
    window.dispatchEvent(new Event("staccato:preview-start"));
    const params = new URLSearchParams({ artistName, trackTitle: title });
    audio.src = `/api/preview/${recordingMbid}/stream?${params}`;
    audio.play().catch(() => {});
    setPlayingMbid(recordingMbid);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingMbid(null);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  const visibleTracks = tracks.filter(
    (t) => !t.recordingMbid || !dismissed.has(t.recordingMbid),
  );
  const allInLibrary =
    visibleTracks.length > 0 &&
    visibleTracks.every(
      (t) => t.recordingMbid && ((t.inLibrary ?? false) || (trackStates[t.recordingMbid] ?? false)),
    );
  const totalDurationMs = tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0);

  function addAll() {
    const next: Record<string, boolean> = {};
    for (const t of tracks) {
      if (t.recordingMbid) next[t.recordingMbid] = true;
    }
    setTrackStates(next);
  }

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

          {/* Add all / all added */}
          {allInLibrary ? (
            <span
              className="inline-flex items-center gap-2 text-[0.8rem] font-medium"
              style={{ color: "oklch(1 0 0 / 60%)" }}
            >
              <Check className="w-3.5 h-3.5" />
              All tracks in your library
            </span>
          ) : (
            <button
              onClick={addAll}
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
          visibleTracks.map((track, i) => (
            <RecommendedTrackRow
              key={track.recordingMbid ?? `track-${i}`}
              track={track}
              index={i}
              isPlaying={!!track.recordingMbid && playingMbid === track.recordingMbid}
              inLibrary={(track.inLibrary ?? false) || (!!track.recordingMbid && (trackStates[track.recordingMbid] ?? false))}
              onPlay={(t) => {
                if (t.recordingMbid) {
                  handlePreview(t.recordingMbid, t.artistName ?? "", t.title);
                }
              }}
              onAddToLibrary={() => {
                if (track.recordingMbid) {
                  setTrackStates((s) => ({ ...s, [track.recordingMbid!]: true }));
                }
              }}
              onDismiss={() => {
                if (track.recordingMbid) {
                  setDismissed((s) => new Set(s).add(track.recordingMbid!));
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
