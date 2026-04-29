import { useState } from "react";
import { Music2, Pause, Play } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";

export interface RecommendedTrack {
  id: string;
  title: string;
  albumTitle: string;
  artistName: string;
  durationSeconds: number;
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function RecommendedTrackListHeader() {
  return (
    <div
      className="grid items-center gap-3 px-2 pb-2 border-b border-border mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      style={{ gridTemplateColumns: "40px 40px 1fr 1fr 1fr 52px" }}
    >
      <div className="text-center">#</div>
      <div />
      <div>Title</div>
      <div>Album</div>
      <div>Artist</div>
      <div className="text-right">Time</div>
    </div>
  );
}

export function RecommendedTrackRow({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
}: {
  track: RecommendedTrack;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay?: (track: RecommendedTrack) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const gradient = generateAlbumGradient(track.albumTitle, track.artistName);

  return (
    <div
      className="grid items-center gap-3 px-2 py-1.5 rounded-lg cursor-default transition-colors"
      style={{
        gridTemplateColumns: "40px 40px 1fr 1fr 1fr 52px",
        background: hovered ? "oklch(1 0 0 / 5%)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onPlay?.(track)}
    >
      {/* Index / play */}
      <div
        className="text-[0.8rem] tabular-nums text-center leading-none"
        style={{ color: isActive ? "oklch(0.7 0.15 250)" : undefined }}
      >
        {hovered ? (
          <span
            className="flex justify-center cursor-pointer text-foreground"
            onClick={() => onPlay?.(track)}
          >
            <Play className="w-3 h-3" fill="currentColor" />
          </span>
        ) : isActive && isPlaying ? (
          <span
            className="flex justify-center"
            style={{ color: "oklch(0.7 0.15 250)" }}
          >
            <Pause className="w-3 h-3" fill="currentColor" />
          </span>
        ) : (
          <span className="text-muted-foreground">{index + 1}</span>
        )}
      </div>

      {/* Art */}
      <div
        className="w-9 h-9 rounded flex items-center justify-center shrink-0"
        style={{ background: gradient }}
      >
        <Music2 className="w-3.5 h-3.5 text-white/20" />
      </div>

      {/* Title */}
      <div
        className="text-sm truncate"
        style={{
          fontWeight: isActive ? 600 : 400,
          color: isActive ? "oklch(0.7 0.15 250)" : undefined,
        }}
      >
        {track.title}
      </div>

      {/* Album */}
      <div className="text-xs text-muted-foreground truncate">
        {track.albumTitle}
      </div>

      {/* Artist */}
      <div className="text-xs text-muted-foreground truncate">
        {track.artistName}
      </div>

      {/* Duration */}
      <div className="text-xs text-muted-foreground tabular-nums text-right">
        {fmt(track.durationSeconds)}
      </div>
    </div>
  );
}
