import { useState } from "react";
import {
  Check,
  Clock,
  Download,
  Pause,
  Play,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { generateAlbumGradient, formatMs } from "@/lib/music";
import type { UiDownloadStatus } from "@/hooks/useDownloads";

export interface TrackRowData {
  recordingMbid: string | null;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  coverArtUrl: string | null;
  durationMs: number | null;
  inLibrary?: boolean;
  releaseYear?: number | null;
}

const GRID_WITH_ACTIONS = "40px 40px 1fr 1fr 1fr 32px 52px 34px 34px";
const GRID_NO_ACTIONS = "40px 40px 1fr 1fr 1fr 32px 52px";

export function RecommendedTrackListHeader({
  showActions = true,
}: {
  showActions?: boolean;
}) {
  return (
    <div
      className="grid items-center gap-3 px-2 pb-2 border-b border-border mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      style={{
        gridTemplateColumns: showActions ? GRID_WITH_ACTIONS : GRID_NO_ACTIONS,
      }}
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
      {showActions && <div />}
      {showActions && <div />}
    </div>
  );
}

export function RecommendedTrackRow({
  track,
  index,
  isPlaying,
  inLibrary,
  downloadStatus,
  addDisabledReason,
  onPlay,
  onAddToLibrary,
  onRetry,
  onDismiss,
}: {
  track: TrackRowData;
  index: number;
  isPlaying: boolean;
  inLibrary: boolean;
  downloadStatus?: UiDownloadStatus | null;
  addDisabledReason?: string | null;
  onPlay?: (track: TrackRowData) => void;
  onAddToLibrary?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dismissHovered, setDismissHovered] = useState(false);
  const showActions = !!(onAddToLibrary || onDismiss);
  const gradient = generateAlbumGradient(
    track.albumTitle ?? "",
    track.artistName ?? "",
  );

  return (
    <div
      className="grid items-center gap-3 px-2 py-1.5 rounded-lg cursor-default transition-colors"
      style={{
        gridTemplateColumns: showActions ? GRID_WITH_ACTIONS : GRID_NO_ACTIONS,
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
        {formatMs(track.durationMs)}
      </div>

      {/* Status / Add */}
      {showActions && (
        <DownloadCell
          inLibrary={inLibrary}
          downloadStatus={downloadStatus ?? null}
          hovered={hovered}
          addDisabledReason={addDisabledReason ?? null}
          onAddToLibrary={onAddToLibrary}
          onRetry={onRetry}
        />
      )}

      {/* Dismiss */}
      {showActions && (
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
      )}
    </div>
  );
}

function DownloadCell({
  inLibrary,
  downloadStatus,
  hovered,
  addDisabledReason,
  onAddToLibrary,
  onRetry,
}: {
  inLibrary: boolean;
  downloadStatus: UiDownloadStatus | null;
  hovered: boolean;
  addDisabledReason: string | null;
  onAddToLibrary?: () => void;
  onRetry?: () => void;
}) {
  if (inLibrary || downloadStatus === "completed") {
    return (
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
    );
  }
  if (downloadStatus === "pending") {
    return (
      <div
        className="w-7 h-7 rounded-[7px] flex items-center justify-center"
        style={{ background: "oklch(1 0 0 / 6%)", color: "oklch(0.65 0 0)" }}
        title="Queued for download"
      >
        <Clock className="w-3 h-3" />
      </div>
    );
  }
  if (downloadStatus === "downloading") {
    return (
      <div
        className="w-7 h-7 rounded-[7px] flex items-center justify-center"
        style={{
          background: "oklch(0.7 0.15 250 / 12%)",
          color: "oklch(0.72 0.15 250)",
        }}
        title="Downloading from Lidarr"
      >
        <Download className="w-3 h-3" />
      </div>
    );
  }
  if (downloadStatus === "failed") {
    return (
      <button
        className="w-7 h-7 rounded-[7px] flex items-center justify-center"
        style={{
          background: "oklch(0.65 0.22 25 / 15%)",
          color: "oklch(0.7 0.22 25)",
        }}
        title="Download failed — click to retry"
        onClick={onRetry}
      >
        <RotateCw className="w-3 h-3" />
      </button>
    );
  }
  const disabled = !!addDisabledReason;
  return (
    <button
      className="w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors"
      style={{
        color: "oklch(0.55 0 0)",
        opacity: hovered || disabled ? (disabled ? 0.3 : 1) : 0,
        transition: "opacity 0.15s",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      title={disabled ? addDisabledReason! : "Add to library"}
      onClick={disabled ? undefined : onAddToLibrary}
      disabled={disabled}
    >
      <Plus className="w-3 h-3" />
    </button>
  );
}
