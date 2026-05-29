import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/music";
import { getSliderValue } from "@/lib/slider";
import { useEffect, useRef, useState } from "react";

interface SeekBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  duration: number;
  trackId: string | undefined;
  initialTime: number;
  onSeek: (time: number) => void;
  accumulatedPlayTimeRef: React.MutableRefObject<number>;
  lastTrackedAudioTimeRef: React.MutableRefObject<number | null>;
}

export function SeekBar({
  audioRef,
  duration,
  trackId,
  initialTime,
  onSeek,
  accumulatedPlayTimeRef,
  lastTrackedAudioTimeRef,
}: SeekBarProps) {
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [seekDisplay, setSeekDisplay] = useState(initialTime);
  const isSeekingRef = useRef(false);

  // Ref so the track-reset effect reads the latest initialTime without subscribing to it
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;

  // Reset position when track changes
  useEffect(() => {
    setCurrentTime(initialTimeRef.current);
    setSeekDisplay(initialTimeRef.current);
  }, [trackId]);

  // Register timeupdate listener for the lifetime of the component
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const nextTime = audio.currentTime;
      const previousTime = lastTrackedAudioTimeRef.current;
      if (
        previousTime != null &&
        !audio.paused &&
        !audio.seeking &&
        !isSeekingRef.current
      ) {
        const naturalPlayDelta = nextTime - previousTime;
        if (naturalPlayDelta > 0) {
          accumulatedPlayTimeRef.current += naturalPlayDelta;
        }
      }
      lastTrackedAudioTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      if (!isSeekingRef.current) {
        setSeekDisplay(nextTime);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [audioRef, lastTrackedAudioTimeRef, accumulatedPlayTimeRef]);

  const handleSeekChange = (value: number | readonly number[]) => {
    const v = getSliderValue(value, seekDisplay);
    isSeekingRef.current = true;
    setSeekDisplay(v);
  };

  const handleSeekCommitted = (value: number | readonly number[]) => {
    isSeekingRef.current = false;
    onSeek(getSliderValue(value, seekDisplay));
  };

  return (
    <div className="flex items-center gap-2 w-full mt-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(currentTime)}
      </span>
      <Slider
        value={[seekDisplay]}
        min={0}
        max={duration}
        step={1}
        onValueChange={handleSeekChange}
        onValueCommitted={handleSeekCommitted}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  );
}
