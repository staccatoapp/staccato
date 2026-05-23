import { useRef, useState } from "react";
import { Clock, Music2, Pause, Play } from "lucide-react";
import type { TrackListItem } from "@staccato/shared";
import { formatTime, generateAlbumGradient } from "@/lib/music";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { AddToPlaylistDropdown } from "./add-to-playlist-dropdown";
import { FeaturedArtists } from "@/components/music/FeaturedArtists";

export function TrackRow({
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
        <FeaturedArtists credits={track.artists} />
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

function TrackListFooterSkeletons() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function TrackListHeader() {
  return (
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
  );
}

export function TrackList({
  tracks,
  activeTrackId,
  isPlaying,
  onPlayTrack,
  onEndReached,
  isFetchingNextPage,
  hasNextPage = true,
}: {
  tracks: TrackListItem[];
  activeTrackId?: string;
  isPlaying?: boolean;
  onPlayTrack: (index: number) => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useInfiniteScrollSentinel({
    ref: sentinelRef,
    onIntersect: () => onEndReached?.(),
    enabled: !!onEndReached && hasNextPage && !isFetchingNextPage,
  });

  return (
    <div>
      <TrackListHeader />
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
      {isFetchingNextPage && <TrackListFooterSkeletons />}
      {onEndReached && (
        <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      )}
    </div>
  );
}
