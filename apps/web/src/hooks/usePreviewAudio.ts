import { useEffect, useRef, useState } from "react";

export function usePreviewAudio() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingMbid(null);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  function handlePreview(recordingMbid: string, artistName: string, title: string) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingMbid === recordingMbid) {
      audio.pause();
      setPlayingMbid(null);
      return;
    }
    window.dispatchEvent(new Event("staccato:preview-start"));
    const params = new URLSearchParams({ artistName, trackTitle: title });
    audio.src = `/api/preview/${recordingMbid}/stream?${params}`;
    audio.play().catch(() => {});
    setPlayingMbid(recordingMbid);
  }

  return { audioRef, playingMbid, handlePreview };
}
