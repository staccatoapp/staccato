import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PlaybackSessionSchema, TrackLyricsSchema } from "@staccato/shared";
import type { PlaybackSession, TrackLyrics } from "@staccato/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getSliderValue } from "@/lib/slider";
import { LyricsPanel } from "./lyrics-panel";
import { SeekBar } from "./seek-bar";
import { FeaturedArtists } from "@/components/music/FeaturedArtists";

function PlayerBar() {
  const queryClient = useQueryClient();

  const audioRef = useRef<HTMLAudioElement>(null);
  const currentTrackIndexRef = useRef(0);
  const accumulatedPlayTimeRef = useRef(0);
  const lastTrackedAudioTimeRef = useRef<number | null>(null);

  const { volume, setVolume } = useVolume();
  const [displayVolume, setDisplayVolume] = useState(volume);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  useEffect(() => {
    setDisplayVolume(volume);
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const { data: playbackSession } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async (): Promise<PlaybackSession> => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch playback session");
      return PlaybackSessionSchema.parse(await res.json());
    },
    refetchInterval: (query) => (query.state.data?.isPlaying ? 5000 : false),
  });

  const currentTrack =
    playbackSession?.trackQueue?.[playbackSession?.currentTrackIndex];

  // Refs so track-change / play-state effects can read the latest values without subscribing
  const playbackSessionRef = useRef(playbackSession);
  playbackSessionRef.current = playbackSession;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

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

  // Keep currentTrackIndexRef in sync
  useEffect(() => {
    currentTrackIndexRef.current = playbackSession?.currentTrackIndex ?? 0;
  }, [playbackSession?.currentTrackIndex]);

  // Effect: track source change — deps on id only; reads session/volume via refs
  useEffect(() => {
    const audio = audioRef.current;
    const ct = currentTrackRef.current;
    if (!audio || !ct) return;
    const currentTrackPosition =
      playbackSessionRef.current?.currentTrackPositionInSeconds ?? 0;
    audio.src = `/api/tracks/${ct.id}/stream`;
    audio.volume = volumeRef.current / 100;
    audio.currentTime = currentTrackPosition;
    accumulatedPlayTimeRef.current =
      playbackSessionRef.current?.currentTrackAccumulatedPlayTimeInSeconds ?? 0;
    lastTrackedAudioTimeRef.current = currentTrackPosition;
    if (playbackSessionRef.current?.isPlaying) audio.play().catch(() => {});
  }, [currentTrack?.id]);

  // Effect: isPlaying sync — deps on isPlaying only; reads currentTrack via ref
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackRef.current) return;
    if (playbackSessionRef.current?.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playbackSession?.isPlaying]);

  // Mount effect: audio event listeners + position sync interval
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      const session = queryClient.getQueryData<PlaybackSession>([
        "playback-session",
      ]);
      if (!session) return;
      const nextIndex = session.currentTrackIndex + 1;
      const isLastTrack = nextIndex >= session.trackQueue.length;
      if (isLastTrack) {
        audio.currentTime = 0;
        lastTrackedAudioTimeRef.current = 0;
      }
      fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPlaying: !isLastTrack,
          currentTrackIndex: isLastTrack
            ? session.currentTrackIndex
            : nextIndex,
          currentTrackPositionInSeconds: 0,
          currentTrackAccumulatedPlayTimeInSeconds: 0,
          currentTrackListenEventCreated: false,
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["playback-session"] });
      });
    };

    const handlePause = () => {
      const session = queryClient.getQueryData<PlaybackSession>([
        "playback-session",
      ]);
      if (!session || !audioRef.current || audioRef.current.ended) return;
      fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPlaying: false,
          currentTrackIndex: session.currentTrackIndex,
          currentTrackPositionInSeconds: Math.floor(
            audioRef.current.currentTime,
          ),
          currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
            accumulatedPlayTimeRef.current,
          ),
        }),
      });
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);

    const interval = setInterval(() => {
      if (!audio || audio.paused) return;
      fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPlaying: true,
          currentTrackIndex: currentTrackIndexRef.current,
          currentTrackPositionInSeconds: Math.floor(audio.currentTime),
          currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
            accumulatedPlayTimeRef.current,
          ),
        }),
      });
    }, 5000);

    const handlePreviewStart = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    window.addEventListener("staccato:preview-start", handlePreviewStart);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      clearInterval(interval);
      window.removeEventListener("staccato:preview-start", handlePreviewStart);
    };
  }, [queryClient]);

  const stateMutation = useMutation({
    mutationFn: async (state: {
      isPlaying: boolean;
      currentTrackIndex: number;
      currentTrackPositionInSeconds: number;
      currentTrackAccumulatedPlayTimeInSeconds: number;
      currentTrackListenEventCreated?: boolean;
    }) => {
      const res = await fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error("Failed to update playback state");
      return res.json() as Promise<PlaybackSession>;
    },
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: ["playback-session"] });
      const prev = queryClient.getQueryData<PlaybackSession>([
        "playback-session",
      ]);
      queryClient.setQueryData<PlaybackSession>(["playback-session"], (old) =>
        old ? { ...old, ...state } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev)
        queryClient.setQueryData(["playback-session"], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["playback-session"] });
    },
  });

  const handlePlayPause = () => {
    if (!playbackSession) return;
    stateMutation.mutate({
      isPlaying: !playbackSession.isPlaying,
      currentTrackIndex: playbackSession.currentTrackIndex,
      currentTrackPositionInSeconds: Math.floor(
        audioRef.current?.currentTime ??
          playbackSession.currentTrackPositionInSeconds,
      ),
      currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
        accumulatedPlayTimeRef.current,
      ),
    });
  };

  const handleNext = () => {
    if (!playbackSession) return;
    const nextIndex = playbackSession.currentTrackIndex + 1;
    const isLastTrack = nextIndex >= playbackSession.trackQueue.length;
    if (isLastTrack && audioRef.current) {
      audioRef.current.currentTime = 0;
      lastTrackedAudioTimeRef.current = 0;
    }
    stateMutation.mutate({
      isPlaying: !isLastTrack,
      currentTrackIndex: isLastTrack
        ? playbackSession.currentTrackIndex
        : nextIndex,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    });
  };

  const handlePrev = () => {
    if (!playbackSession || !audioRef.current) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      lastTrackedAudioTimeRef.current = 0;
      stateMutation.mutate({
        isPlaying: playbackSession.isPlaying,
        currentTrackIndex: playbackSession.currentTrackIndex,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: 0,
        currentTrackListenEventCreated: false,
      });
    } else {
      const prevIndex = Math.max(0, playbackSession.currentTrackIndex - 1);
      const isSameTrack = prevIndex === playbackSession.currentTrackIndex;
      if (isSameTrack) {
        audioRef.current.currentTime = 0;
        lastTrackedAudioTimeRef.current = 0;
      }
      stateMutation.mutate({
        isPlaying: playbackSession.isPlaying,
        currentTrackIndex: prevIndex,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: isSameTrack
          ? Math.floor(accumulatedPlayTimeRef.current)
          : 0,
        currentTrackListenEventCreated: false,
      });
    }
  };

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

  const seekToTime = (time: number) => {
    lastTrackedAudioTimeRef.current = time;
    if (audioRef.current) audioRef.current.currentTime = time;
    stateMutation.mutate({
      isPlaying: playbackSession?.isPlaying ?? false,
      currentTrackIndex: playbackSession?.currentTrackIndex ?? 0,
      currentTrackPositionInSeconds: Math.floor(time),
      currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
        accumulatedPlayTimeRef.current,
      ),
    });
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
              <Button variant="ghost" size="icon" onClick={handlePrev}>
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button size="icon" onClick={handlePlayPause}>
                {playbackSession.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNext}>
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
            <SeekBar
              audioRef={audioRef}
              duration={currentTrack?.durationSeconds ?? 1}
              trackId={currentTrack?.id}
              initialTime={playbackSession?.currentTrackPositionInSeconds ?? 0}
              onSeek={seekToTime}
              accumulatedPlayTimeRef={accumulatedPlayTimeRef}
              lastTrackedAudioTimeRef={lastTrackedAudioTimeRef}
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
