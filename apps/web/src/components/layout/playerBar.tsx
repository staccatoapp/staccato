import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { PlaybackSession } from "@staccato/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayerBar() {
  const queryClient = useQueryClient();

  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);
  const currentTrackIndexRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [seekDisplay, setSeekDisplay] = useState(0);

  const { data: playbackSession } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async (): Promise<PlaybackSession> => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch playback session");
      const json = await res.json();
      return json.session;
    },
    refetchInterval: (query) => (query.state.data?.isPlaying ? 5000 : false),
  });

  const currentTrack =
    playbackSession?.trackQueue?.[playbackSession?.currentTrackIndex];

  // Keep currentTrackIndexRef in sync
  useEffect(() => {
    currentTrackIndexRef.current = playbackSession?.currentTrackIndex ?? 0;
  }, [playbackSession?.currentTrackIndex]);

  // Effect: track source change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = `/api/tracks/${currentTrack.id}/stream`;
    audio.currentTime = playbackSession?.currentTrackPositionInSeconds ?? 0;
    setCurrentTime(playbackSession?.currentTrackPositionInSeconds ?? 0);
    setSeekDisplay(playbackSession?.currentTrackPositionInSeconds ?? 0);
    if (playbackSession?.isPlaying) audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // Effect: isPlaying sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (playbackSession?.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSession?.isPlaying]);

  // Mount effect: audio event listeners + position sync interval
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (!isSeekingRef.current) {
        setSeekDisplay(audio.currentTime);
      }
    };

    const handleEnded = () => {
      const session =
        queryClient.getQueryData<PlaybackSession>(["playback-session"]);
      if (!session) return;
      const nextIndex = session.currentTrackIndex + 1;
      const isLastTrack = nextIndex >= session.trackQueue.length;
      fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPlaying: !isLastTrack,
          currentTrackIndex: isLastTrack
            ? session.currentTrackIndex
            : nextIndex,
          currentTrackPositionInSeconds: 0,
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["playback-session"] });
      });
    };

    const handlePause = () => {
      const session =
        queryClient.getQueryData<PlaybackSession>(["playback-session"]);
      if (!session || !audioRef.current) return;
      fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPlaying: false,
          currentTrackIndex: session.currentTrackIndex,
          currentTrackPositionInSeconds: Math.floor(
            audioRef.current.currentTime,
          ),
        }),
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
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
        }),
      });
    }, 5000);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateMutation = useMutation({
    mutationFn: async (state: {
      isPlaying: boolean;
      currentTrackIndex: number;
      currentTrackPositionInSeconds: number;
    }) => {
      const res = await fetch("/api/playback/session/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error("Failed to update playback state");
      return res.json() as Promise<{ session: PlaybackSession }>;
    },
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: ["playback-session"] });
      const prev =
        queryClient.getQueryData<PlaybackSession>(["playback-session"]);
      queryClient.setQueryData<PlaybackSession>(
        ["playback-session"],
        (old) => (old ? { ...old, ...state } : old),
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
    });
  };

  const handleNext = () => {
    if (!playbackSession) return;
    const nextIndex = playbackSession.currentTrackIndex + 1;
    const isLastTrack = nextIndex >= playbackSession.trackQueue.length;
    stateMutation.mutate({
      isPlaying: !isLastTrack,
      currentTrackIndex: isLastTrack
        ? playbackSession.currentTrackIndex
        : nextIndex,
      currentTrackPositionInSeconds: 0,
    });
  };

  const handlePrev = () => {
    if (!playbackSession || !audioRef.current) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setSeekDisplay(0);
      stateMutation.mutate({
        isPlaying: playbackSession.isPlaying,
        currentTrackIndex: playbackSession.currentTrackIndex,
        currentTrackPositionInSeconds: 0,
      });
    } else {
      const prevIndex = Math.max(0, playbackSession.currentTrackIndex - 1);
      stateMutation.mutate({
        isPlaying: playbackSession.isPlaying,
        currentTrackIndex: prevIndex,
        currentTrackPositionInSeconds: 0,
      });
    }
  };

  const handleSeekChange = (value: number | readonly number[]) => {
    const v = Array.isArray(value) ? (value as number[])[0] : (value as number);
    isSeekingRef.current = true;
    setSeekDisplay(v);
  };

  const handleSeekCommitted = (value: number | readonly number[]) => {
    const seekTo = Array.isArray(value) ? (value as number[])[0] : (value as number);
    isSeekingRef.current = false;
    if (audioRef.current) audioRef.current.currentTime = seekTo;
    setCurrentTime(seekTo);
    setSeekDisplay(seekTo);
    stateMutation.mutate({
      isPlaying: playbackSession?.isPlaying ?? false,
      currentTrackIndex: playbackSession?.currentTrackIndex ?? 0,
      currentTrackPositionInSeconds: Math.floor(seekTo),
    });
  };

  return (
    <>
      <audio ref={audioRef} />
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
              <p className="text-xs text-muted-foreground">
                {currentTrack?.artistName || "Unknown Artist"}
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
            <div className="flex items-center gap-2 w-full mt-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatTime(currentTime)}
              </span>
              <Slider
                value={[seekDisplay]}
                min={0}
                max={currentTrack?.durationSeconds ?? 1}
                step={1}
                onValueChange={handleSeekChange}
                onValueCommitted={handleSeekCommitted}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatTime(currentTrack?.durationSeconds ?? 0)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center w-1/6" />

          {/* Right: Volume */}
          <div className="flex justify-end items-center gap-2 w-1/6">
            <Slider defaultValue={[80]} max={100} step={1} className="w-24" />
          </div>
        </div>
      )}
    </>
  );
}

export { PlayerBar };
