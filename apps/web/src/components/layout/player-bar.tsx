import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PlaybackSessionSchema, TrackLyricsSchema } from "@staccato/shared";
import type { PlaybackSession, TrackLyrics } from "@staccato/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Mic2,
  MicOff,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVolume } from "@/hooks/useVolume";
import { usePlaybackController } from "@/hooks/usePlaybackController";
import { getSliderValue } from "@/lib/slider";
import { LyricsPanel } from "./lyrics-panel";
import { SeekBar } from "./seek-bar";
import { FeaturedArtists } from "@/components/music/FeaturedArtists";

function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  // The shared controller owns all Staccato Connect playback logic; this
  // component just renders its view state and dispatches transport commands.
  const { viewState, command } = usePlaybackController(audioRef);

  const { volume, setVolume } = useVolume();
  const [displayVolume, setDisplayVolume] = useState(volume);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  useEffect(() => {
    setDisplayVolume(volume);
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  // Keep the audio element's volume in sync as the source changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume, viewState.currentTrackIndex]);

  // First-paint snapshot; thereafter the controller's socket pushes the
  // authoritative session straight into this cache.
  const { data: playbackSession } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async (): Promise<PlaybackSession> => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch playback session");
      return PlaybackSessionSchema.parse(await res.json());
    },
  });

  const currentTrack =
    playbackSession?.trackQueue?.[playbackSession?.currentTrackIndex];

  const { data: lyricsData } = useQuery<TrackLyrics | null>({
    queryKey: ["lyrics", currentTrack?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/playback/lyrics?trackId=${currentTrack!.id}`,
      );
      if (res.status === 204) return null;
      if (!res.ok) return null;
      return TrackLyricsSchema.parse(await res.json());
    },
    enabled: !!currentTrack?.id,
    staleTime: Infinity,
  });

  const lyricsAvailable = lyricsData !== undefined && lyricsData !== null;

  // Pause our audio when a 30-second preview starts elsewhere.
  useEffect(() => {
    const handlePreviewStart = () => {
      if (viewState.isPlaying) command({ kind: "setPlaying", value: false });
    };
    window.addEventListener("staccato:preview-start", handlePreviewStart);
    return () =>
      window.removeEventListener("staccato:preview-start", handlePreviewStart);
  }, [viewState.isPlaying, command]);

  const seekToTime = (time: number) =>
    command({ kind: "seek", positionSeconds: time });

  const handleVolumeChanged = (value: number | readonly number[]) => {
    const v = getSliderValue(value, displayVolume);
    setDisplayVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v / 100;
    }
  };

  const handleVolumeCommitted = (value: number | readonly number[]) => {
    setVolume(getSliderValue(value, displayVolume));
  };

  return (
    <>
      <audio ref={audioRef} />
      <LyricsPanel
        track={currentTrack}
        audioRef={audioRef}
        isOpen={lyricsOpen}
        onClose={() => setLyricsOpen(false)}
        onSeek={seekToTime}
        lyrics={lyricsData ?? null}
      />
      {playbackSession && playbackSession.trackQueue.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 h-20 border-t bg-background flex items-center px-4">
          {/* Left: Track info */}
          <div className="flex items-center gap-3 w-1/6">
            {currentTrack?.coverArtUrl ? (
              <img
                src={currentTrack.coverArtUrl}
                className="w-12 h-12 rounded"
                alt={currentTrack.title}
              />
            ) : (
              <div className="w-12 h-12 rounded flex items-center justify-center">
                <Music2 className="w-10 h-10 text-white/20" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium">
                {currentTrack?.title || "No track playing"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentTrack?.artistName || "Unknown Artist"}
                <FeaturedArtists credits={currentTrack?.artists} />
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center w-1/6" />

          {/* Center: Controls */}
          <div className="flex flex-col items-center w-2/6">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => command({ kind: "prev" })}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                onClick={() =>
                  command({ kind: "setPlaying", value: !viewState.isPlaying })
                }
              >
                {viewState.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => command({ kind: "next" })}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
            <SeekBar
              position={viewState.displayPositionSeconds}
              duration={
                currentTrack?.durationSeconds ?? viewState.durationSeconds ?? 1
              }
              onSeek={seekToTime}
            />
          </div>

          {/* Right extras: Lyrics button */}
          <div className="flex flex-col items-center justify-center w-1/6">
            <Button
              variant="ghost"
              size="icon"
              disabled={!lyricsAvailable}
              onClick={() => setLyricsOpen((o) => !o)}
              className={
                lyricsOpen && lyricsAvailable
                  ? "bg-primary/15 text-primary"
                  : !lyricsAvailable
                    ? "opacity-40 cursor-not-allowed"
                    : ""
              }
            >
              {lyricsAvailable ? (
                <Mic2 className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Right: Volume */}
          <div className="flex justify-end items-center gap-2 w-1/6">
            <Slider
              onValueChange={handleVolumeChanged}
              onValueCommitted={handleVolumeCommitted}
              value={[displayVolume]}
              max={100}
              step={1}
              className="w-24"
            />
          </div>
        </div>
      )}
    </>
  );
}

export { PlayerBar };
