import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, Clock, Play, Plus, X } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";

export const Route = createFileRoute("/explore/recommendations/$recId")({
  component: RecommendationDetailPage,
});

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")";

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function fmtTotal(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

interface DetailTrack {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  durationSeconds: number;
  inLibrary: boolean;
}

function DetailTrackRow({
  track,
  index,
  inLibrary,
  onAddToLibrary,
  onDismiss,
}: {
  track: DetailTrack;
  index: number;
  inLibrary: boolean;
  onAddToLibrary: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dismissHovered, setDismissHovered] = useState(false);
  const gradient = generateAlbumGradient(track.albumTitle, track.artistName);

  return (
    <div
      className="grid items-center gap-3 px-3 py-[7px] rounded-lg transition-colors"
      style={{
        gridTemplateColumns: "44px 1fr 1fr 60px 34px 34px 34px",
        background: hovered ? "oklch(1 0 0 / 5%)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Index */}
      <div className="text-[0.8rem] tabular-nums text-right pr-1 text-muted-foreground">
        {hovered ? (
          <span className="flex justify-end cursor-pointer text-foreground">
            <Play className="w-3 h-3" fill="currentColor" />
          </span>
        ) : (
          <span>{index + 1}</span>
        )}
      </div>

      {/* Title */}
      <div className="text-sm truncate">{track.title}</div>

      {/* Artist · Album */}
      <div className="text-[0.8rem] text-muted-foreground truncate">
        {track.artistName} · {track.albumTitle}
      </div>

      {/* Duration */}
      <div className="text-[0.8rem] text-muted-foreground tabular-nums text-right">
        {fmt(track.durationSeconds)}
      </div>

      {/* Play icon button (hover-reveal) */}
      <button
        className="w-7 h-7 rounded-[7px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        style={{
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s, color 0.12s",
        }}
        title="Play"
      >
        <Play className="w-3 h-3" fill="currentColor" />
      </button>

      {/* Add to library toggle */}
      <button
        className="w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors"
        style={{
          background: inLibrary ? "oklch(0.7 0.15 250 / 15%)" : "transparent",
          color: inLibrary ? "oklch(0.7 0.15 250)" : "oklch(0.55 0 0)",
          opacity: hovered || inLibrary ? 1 : 0,
          cursor: inLibrary ? "default" : "pointer",
          transition: "opacity 0.15s, background 0.12s, color 0.12s",
        }}
        title={inLibrary ? "In your library" : "Add to library"}
        onClick={inLibrary ? undefined : onAddToLibrary}
      >
        {inLibrary ? (
          <Check className="w-3 h-3" strokeWidth={2.5} />
        ) : (
          <Plus className="w-3 h-3" />
        )}
      </button>

      {/* Dismiss */}
      <button
        className="w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors"
        style={{
          color: dismissHovered ? "oklch(0.65 0.22 25)" : "oklch(0.55 0 0)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s, color 0.12s",
        }}
        title="Don't suggest tracks like this"
        onClick={onDismiss}
        onMouseEnter={() => setDismissHovered(true)}
        onMouseLeave={() => setDismissHovered(false)}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function RecommendationDetailPage() {
  const { recId } = Route.useParams();

  const gradient = generateAlbumGradient(recId, "recommendation");

  const PLACEHOLDER_TRACKS: DetailTrack[] = [
    {
      id: "p1",
      title: "Track 1",
      artistName: "Artist A",
      albumTitle: "Album X",
      durationSeconds: 210,
      inLibrary: true,
    },
    {
      id: "p2",
      title: "Track 2",
      artistName: "Artist B",
      albumTitle: "Album Y",
      durationSeconds: 185,
      inLibrary: false,
    },
    {
      id: "p3",
      title: "Track 3",
      artistName: "Artist C",
      albumTitle: "Album Z",
      durationSeconds: 240,
      inLibrary: false,
    },
  ];

  const [trackStates, setTrackStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PLACEHOLDER_TRACKS.map((t) => [t.id, t.inLibrary])),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleTracks = PLACEHOLDER_TRACKS.filter((t) => !dismissed.has(t.id));
  const allInLibrary =
    visibleTracks.length > 0 && visibleTracks.every((t) => trackStates[t.id]);
  const totalDuration = PLACEHOLDER_TRACKS.reduce(
    (s, t) => s + t.durationSeconds,
    0,
  );

  function addAll() {
    setTrackStates(
      Object.fromEntries(PLACEHOLDER_TRACKS.map((t) => [t.id, true])),
    );
  }

  return (
    <div className="pb-24">
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
            {recId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
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
            {PLACEHOLDER_TRACKS.length} tracks · {fmtTotal(totalDuration)}
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
        {/* Header */}
        <div
          className="grid items-center gap-3 px-3 pb-2 border-b border-border mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          style={{ gridTemplateColumns: "44px 1fr 1fr 60px 34px 34px 34px" }}
        >
          <div className="text-right pr-1">#</div>
          <div>Title</div>
          <div>Artist · Album</div>
          <div className="text-right flex justify-end">
            <Clock className="w-3 h-3" />
          </div>
          <div />
          <div />
          <div />
        </div>

        {/* Rows */}
        {visibleTracks.map((track, i) => (
          <DetailTrackRow
            key={track.id}
            track={track}
            index={i}
            inLibrary={trackStates[track.id] ?? false}
            onAddToLibrary={() =>
              setTrackStates((s) => ({ ...s, [track.id]: true }))
            }
            onDismiss={() => setDismissed((s) => new Set(s).add(track.id))}
          />
        ))}

        {visibleTracks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            All tracks dismissed.
          </p>
        )}
      </div>
    </div>
  );
}
