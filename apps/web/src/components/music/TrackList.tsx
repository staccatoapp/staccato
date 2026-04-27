import { type ReactNode } from "react";
import { Clock, Pause, Play } from "lucide-react";

export interface TrackListTrack {
  key: string;
  num: string;
  title: string;
  formattedDuration: string;
}

export function TrackList({
  tracks,
  onPlayTrack,
  onPreviewTrack,
  isPreviewPlaying,
  extraAction,
}: {
  tracks: TrackListTrack[];
  onPlayTrack?: (index: number) => void;
  onPreviewTrack?: (index: number) => void;
  isPreviewPlaying?: (index: number) => boolean;
  extraAction?: (index: number) => ReactNode;
}) {
  const hasAction = !!(onPlayTrack || onPreviewTrack);
  const hasExtra = !!extraAction;
  const cols = hasExtra
    ? "grid-cols-[2rem_1fr_4rem_2rem_2rem]"
    : hasAction
      ? "grid-cols-[2rem_1fr_4rem_2rem]"
      : "grid-cols-[2rem_1fr_4rem]";

  return (
    <div>
      <div
        className={`grid ${cols} gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-widest border-b border-border mb-1`}
      >
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="flex justify-end">
          <Clock className="w-3.5 h-3.5" />
        </span>
        {hasAction && <span />}
        {hasExtra && <span />}
      </div>

      {tracks.map((track, index) => {
        const playing = isPreviewPlaying?.(index) ?? false;
        return (
          <div
            key={track.key}
            className={`group grid ${cols} gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-accent/50 transition-colors`}
          >
            <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
              {track.num}
            </span>
            <span className="text-foreground truncate self-center">
              {track.title}
            </span>
            <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
              {track.formattedDuration}
            </span>
            {onPlayTrack && (
              <button
                onClick={() => onPlayTrack(index)}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center"
                aria-label={`Play ${track.title}`}
              >
                <Play className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            {onPreviewTrack && (
              <button
                onClick={() => onPreviewTrack(index)}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center"
                aria-label={
                  playing
                    ? `Stop preview of ${track.title}`
                    : `Preview ${track.title}`
                }
              >
                {playing ? (
                  <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            )}
            {hasExtra && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center">
                {extraAction!(index)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
