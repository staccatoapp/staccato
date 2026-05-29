import { useEffect, useState } from "react";

export function useAudioTime(
  audioRef: React.RefObject<HTMLAudioElement | null>,
): number {
  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [audioRef]);
  return currentTime;
}
