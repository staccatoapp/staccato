import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/music";
import { getSliderValue } from "@/lib/slider";
import { useEffect, useRef, useState } from "react";

interface SeekBarProps {
  /** Display position in seconds — the controller's view position (the active
   *  device's live player time, or a passive device's interpolated position). */
  position: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function SeekBar({ position, duration, onSeek }: SeekBarProps) {
  const [seekDisplay, setSeekDisplay] = useState(position);
  const isSeekingRef = useRef(false);

  // Follow the controller position, except while the user is scrubbing (so the
  // incoming updates don't fight the drag).
  useEffect(() => {
    if (!isSeekingRef.current) setSeekDisplay(position);
  }, [position]);

  const handleSeekChange = (value: number | readonly number[]) => {
    isSeekingRef.current = true;
    setSeekDisplay(getSliderValue(value, seekDisplay));
  };

  const handleSeekCommitted = (value: number | readonly number[]) => {
    isSeekingRef.current = false;
    onSeek(getSliderValue(value, seekDisplay));
  };

  return (
    <div className="flex items-center gap-2 w-full mt-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(seekDisplay)}
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
