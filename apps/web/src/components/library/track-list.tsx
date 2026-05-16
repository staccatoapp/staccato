import { useState } from "react";
import { Clock, Music2, Pause, Play } from "lucide-react";
import type { TrackListItem } from "@staccato/shared";
import { formatTime, generateAlbumGradient } from "@/lib/music";
import { cn } from "@/lib/utils";
import { AddToPlaylistDropdown } from "./add-to-playlist-dropdown";

function TrackRow({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
}: {
  track: TrackListItem;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const active = hovered || dropOpen;

  return (
    <div
      className={cn(
        "grid items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
        "grid-cols-[2rem_2.25rem_1fr_1fr_1fr_1.5rem_4rem]",
        active ? "bg-white/5" : "bg-transparent",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onPlay}
    >
      {/* # */}
      <div
        className="flex items-center justify-center text-[0.8rem] tabular-nums"
        style={{ color: isActive ? "var(--color-primary)" : undefined }}
      >
        {active ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="text-foreground"
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
          </button>
        ) : isActive && isPlaying ? (
          <Pause
            className="w-3.5 h-3.5"
            fill="currentColor"
            style={{ color: "var(--color-primary)" }}
          />
        ) : (
          <span className="text-muted-foreground">{index + 1}</span>
        )}
      </div>

      {/* Art */}
      <div
        className="w-9 h-9 rounded overflow-hidden flex items-center justify-center shrink-0"
        style={{
          background: generateAlbumGradient(
            track.albumTitle ?? track.title,
            track.artistName,
          ),
        }}
      >
        {track.coverArtUrl ? (
          <img
            src={track.coverArtUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music2 className="w-3.5 h-3.5 text-white/20" />
        )}
      </div>

      {/* Title */}
      <div
        className="truncate text-[0.875rem]"
        style={{
          color: isActive ? "var(--color-primary)" : undefined,
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {track.title}
      </div>

      {/* Album */}
      <div className="truncate text-[0.8rem] text-muted-foreground">
        {track.albumTitle ?? "—"}
      </div>

      {/* Artist */}
      <div className="truncate text-[0.8rem] text-muted-foreground">
        {track.artistName}
      </div>

      {/* + playlist */}
      <div
        className={cn(
          "flex items-center justify-center transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      >
        <AddToPlaylistDropdown
          trackId={track.id}
          onOpenChange={setDropOpen}
        />
      </div>

      {/* Duration */}
      <div className="text-[0.8rem] text-muted-foreground tabular-nums text-right">
        {track.durationSeconds ? formatTime(track.durationSeconds) : "—"}
      </div>
    </div>
  );
}

export function TrackList({
  tracks,
  activeTrackId,
  isPlaying,
  onPlayTrack,
}: {
  tracks: TrackListItem[];
  activeTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (index: number) => void;
}) {
  return (
    <div>
      <div className="grid items-center gap-3 px-2 pb-2 border-b border-border mb-1 grid-cols-[2rem_2.25rem_1fr_1fr_1fr_1.5rem_4rem]">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground text-center">
          #
        </div>
        <div />
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Title
        </div>
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Album
        </div>
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Artist
        </div>
        <div />
        <div className="flex justify-end text-muted-foreground">
          <Clock className="w-3 h-3" />
        </div>
      </div>

      {tracks.map((track, i) => (
        <TrackRow
          key={track.id}
          track={track}
          index={i}
          isActive={track.id === activeTrackId}
          isPlaying={isPlaying ?? false}
          onPlay={() => onPlayTrack(i)}
        />
      ))}
    </div>
  );
}
