import { useEffect, useRef } from "react";
import { Mic2, Music2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaybackTrack, TrackLyrics } from "@staccato/shared";

interface LyricsPanelProps {
  track: PlaybackTrack | null | undefined;
  currentTime: number;
  isOpen: boolean;
  onClose: () => void;
  onSeek: (time: number) => void;
  lyrics: TrackLyrics | null;
}

export function LyricsPanel({
  track,
  currentTime,
  isOpen,
  onClose,
  onSeek,
  lyrics,
}: LyricsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const prevTrackIdRef = useRef<string | null>(null);

  const synced = lyrics?.syncedLyrics ?? null;

  const activeIdx = (() => {
    if (!synced) return -1;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) {
      if ((synced[i]?.startingTime ?? 0) <= currentTime) idx = i;
      else break;
    }
    return idx;
  })();

  // Reset scroll on track change
  useEffect(() => {
    if (!track?.id) return;
    if (prevTrackIdRef.current !== track.id) {
      prevTrackIdRef.current = track.id;
      scrollRef.current?.scrollTo({ top: 0 });
      lineRefs.current = [];
    }
  }, [track?.id]);

  // Auto-scroll active line to near top
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = lineRefs.current[activeIdx];
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({
      top: el.offsetTop - container.offsetTop - 24,
      behavior: "smooth",
    });
  }, [activeIdx]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bottom-20 bg-black/55 z-[48] transition-opacity duration-300"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-20 w-[360px] z-[55] flex flex-col bg-background border-l transition-transform duration-300"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
          {track?.coverArtUrl ? (
            <img
              src={track.coverArtUrl}
              alt={track.title}
              className="w-11 h-11 rounded object-cover shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded bg-white/10 flex items-center justify-center shrink-0">
              <Music2 className="w-5 h-5 text-white/30" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {track?.title ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {track?.artistName ?? "Unknown Artist"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
            <span
              className="text-muted-foreground uppercase tracking-widest"
              style={{ fontSize: "0.65rem" }}
            >
              Lyrics
            </span>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 pb-12">
          {!lyrics || (!lyrics.plainLyrics && !lyrics.syncedLyrics) ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Mic2 className="w-6 h-6" />
              </div>
              <p className="text-sm">No lyrics available</p>
            </div>
          ) : synced ? (
            /* Synced lyrics */
            <div className="space-y-1">
              {synced.map((row, i) => (
                <p
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  onClick={() => onSeek(row.startingTime ?? 0)}
                  className="leading-relaxed cursor-pointer select-none"
                  style={{
                    transition: "color 350ms ease, font-size 200ms ease",
                    color:
                      i === activeIdx
                        ? "hsl(var(--primary))"
                        : i < activeIdx
                          ? "rgba(255,255,255,0.28)"
                          : "rgba(255,255,255,0.55)",
                    fontSize: i === activeIdx ? "1.125rem" : "1rem",
                    fontWeight: i === activeIdx ? 700 : 400,
                  }}
                >
                  {row.lyrics}
                </p>
              ))}
            </div>
          ) : (
            /* Plain lyrics fallback */
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Synced lyrics not available for this track
              </p>
              <pre className="whitespace-pre-wrap text-sm text-white/70 font-sans leading-relaxed">
                {lyrics.plainLyrics}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
