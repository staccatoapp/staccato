import { useState } from "react";
import { Check, Clock, Pause, Play, Plus, X } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";

function fmtMs(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface TrackRowData {
  recordingMbid: string | null;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  coverArtUrl: string | null;
  durationMs: number | null;
  inLibrary?: boolean;
}

export function RecommendedTrackListHeader() {
  return (
    <div
      className="grid items-center gap-3 px-2 pb-2 border-b border-border mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      style={{ gridTemplateColumns: "40px 40px 1fr 1fr 1fr 32px 52px 34px 34px" }}
    >
      <div className="text-center">#</div>
      <div />
      <div>Title</div>
      <div>Album</div>
      <div>Artist</div>
      <div />
      <div className="flex justify-end">
        <Clock className="w-3 h-3" />
      </div>
      <div />
      <div />
    </div>
  );
}

export function RecommendedTrackRow({
  track,
  index,
  isPlaying,
  inLibrary,
  onPlay,
  onAddToLibrary,
  onDismiss,
}: {
  track: TrackRowData;
  index: number;
  isPlaying: boolean;
  inLibrary: boolean;
  onPlay?: (track: TrackRowData) => void;
  onAddToLibrary: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dismissHovered, setDismissHovered] = useState(false);
  const gradient = generateAlbumGradient(
    track.albumTitle ?? "",
    track.artistName ?? "",
  );

  return (
    <div
      className="grid items-center gap-3 px-2 py-1.5 rounded-lg cursor-default transition-colors"
      style={{
        gridTemplateColumns: "40px 40px 1fr 1fr 1fr 32px 52px 34px 34px",
        background: hovered ? "oklch(1 0 0 / 5%)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onPlay?.(track)}
    >
      {/* Index */}
      <div
        className="text-[0.8rem] tabular-nums text-center leading-none"
        style={{ color: isPlaying ? "oklch(0.7 0.15 250)" : undefined }}
      >
        {isPlaying ? (
          <span className="flex justify-center" style={{ color: "oklch(0.7 0.15 250)" }}>
            <Pause className="w-3 h-3" fill="currentColor" />
          </span>
        ) : (
          <span className="text-muted-foreground">{index + 1}</span>
        )}
      </div>

      {/* Cover art */}
      <div
        className="w-9 h-9 rounded shrink-0 overflow-hidden"
        style={{ background: gradient }}
      >
        {track.coverArtUrl && (
          <img
            src={track.coverArtUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      {/* Title */}
      <div
        className="text-sm truncate"
        style={{
          fontWeight: isPlaying ? 600 : 400,
          color: isPlaying ? "oklch(0.7 0.15 250)" : undefined,
        }}
      >
        {track.title}
      </div>

      {/* Album */}
      <div className="text-xs text-muted-foreground truncate">
        {track.albumTitle ?? "—"}
      </div>

      {/* Artist */}
      <div className="text-xs text-muted-foreground truncate">
        {track.artistName ?? "—"}
      </div>

      {/* Preview play button (hover-reveal) */}
      <button
        className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        style={{
          opacity: hovered || isPlaying ? 1 : 0,
          transition: "opacity 0.15s",
        }}
        onClick={() => onPlay?.(track)}
        title={isPlaying ? "Pause" : "Preview"}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Duration */}
      <div className="text-xs text-muted-foreground tabular-nums text-right">
        {fmtMs(track.durationMs)}
      </div>

      {/* Add to library / In library badge */}
      {inLibrary ? (
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center"
          style={{
            background: "oklch(1 0 0 / 10%)",
            color: "oklch(0.75 0.18 55)",
          }}
          title="In your library"
        >
          <Check className="w-3 h-3" strokeWidth={2.5} />
        </div>
      ) : (
        <button
          className="w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors"
          style={{
            color: "oklch(0.55 0 0)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
          title="Add to library"
          onClick={onAddToLibrary}
        >
          <Plus className="w-3 h-3" />
        </button>
      )}

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
