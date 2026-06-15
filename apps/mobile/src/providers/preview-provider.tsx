import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { usePlayback } from "./playback-provider";

interface PreviewContextValue {
  /** recordingMbid of the track currently previewing, or null. */
  previewingId: string | null;
  /** Progress of the current preview, 0..1 (0 when nothing is previewing). */
  previewProgress: number;
  /**
   * Toggle a 30-second preview. Passing the already-previewing id stops it;
   * passing a new id (with a non-null url) starts it, pausing main playback so
   * the two audio sources never overlap. A null url is a no-op (no preview
   * available for that track).
   */
  togglePreview: (id: string, previewUrl: string | null) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Owns a second, independent audio player dedicated to Explore's 30-second
 * previews (recommended tracks carry an absolute Deezer/iTunes `previewUrl`).
 * Kept separate from {@link PlaybackProvider} so a preview never touches the
 * server playback session; the only interaction is pausing the main player
 * when a preview begins. Must be mounted inside a PlaybackProvider.
 */
export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const previewPlayer = useAudioPlayer();
  const status = useAudioPlayerStatus(previewPlayer);
  const { isPlaying: mainPlaying, togglePlay } = usePlayback();
  const [startedId, setStartedId] = useState<string | null>(null);

  // A finished clip reverts the row to its play icon without a state write:
  // once the player reports `didJustFinish`, the started id no longer counts as
  // "previewing", and a subsequent tap on the same row replays it.
  const previewingId = status.didJustFinish ? null : startedId;

  const togglePreview = useCallback(
    (id: string, previewUrl: string | null) => {
      if (previewingId === id) {
        previewPlayer.pause();
        setStartedId(null);
        return;
      }
      if (!previewUrl) return;
      // Pause main playback so we don't play two things at once.
      if (mainPlaying) togglePlay();
      previewPlayer.replace({ uri: previewUrl });
      previewPlayer.seekTo(0).catch((err) => {
        console.warn("failed to rewind preview", { id, err });
      });
      previewPlayer.play();
      setStartedId(id);
    },
    [previewingId, mainPlaying, togglePlay, previewPlayer],
  );

  const previewProgress =
    previewingId && status.duration
      ? Math.min(status.currentTime / status.duration, 1)
      : 0;

  const value = useMemo<PreviewContextValue>(
    () => ({ previewingId, previewProgress, togglePreview }),
    [previewingId, previewProgress, togglePreview],
  );

  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

export function usePreview(): PreviewContextValue {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error("usePreview must be used inside a PreviewProvider");
  }
  return context;
}
