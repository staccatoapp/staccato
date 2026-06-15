import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePlayback } from "./playback-provider";

interface PreviewContextValue {
  /** recordingMbid of the track currently previewing, or null. */
  previewingId: string | null;
  /** recordingMbid whose preview url is being resolved (lazy search), or null. */
  previewLoadingId: string | null;
  /** Progress of the current preview, 0..1 (0 when nothing is previewing). */
  previewProgress: number;
  /**
   * Toggle a 30-second preview for `id`. Passing the already-previewing id stops
   * it; otherwise `resolveUrl` is awaited to obtain the clip url — an inline url
   * for recommended tracks, or a lazy server lookup for search results — and a
   * null result is a no-op (no preview available). Main playback is paused while
   * a preview plays so the two audio sources never overlap.
   */
  togglePreview: (id: string, resolveUrl: () => Promise<string | null>) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Owns a second, independent audio player dedicated to Explore's 30-second
 * previews. Kept separate from {@link PlaybackProvider} so a preview never
 * touches the server playback session; the only interaction is pausing the main
 * player when a preview begins. Must be mounted inside a PlaybackProvider.
 */
export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const previewPlayer = useAudioPlayer();
  const status = useAudioPlayerStatus(previewPlayer);
  const { isPlaying: mainPlaying, togglePlay } = usePlayback();

  // The clip we want to be playing: { id, url }, or null when stopped.
  const [target, setTarget] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  // A finished clip reverts the row to its play icon without a state write:
  // once the player reports `didJustFinish`, the target no longer counts as
  // "previewing", and a subsequent tap on the same row replays it.
  const previewingId = status.didJustFinish ? null : (target?.id ?? null);

  // Load the source and start it. Driving the player from an effect (rather than
  // the tap handler) mirrors PlaybackProvider; the loaded-gate effect below is
  // what actually fixes playback.
  useEffect(() => {
    if (!target) return;
    previewPlayer.replace({ uri: target.url });
    previewPlayer.play();
  }, [target, previewPlayer]);

  // Re-assert play once expo-audio confirms the new source has loaded. A play()
  // issued on the same tick as replace() races ahead of the native load and is
  // dropped (the original frozen-preview bug); gating on `isLoaded` guarantees
  // one play() lands after the clip is ready.
  useEffect(() => {
    if (target && status.isLoaded) previewPlayer.play();
  }, [target, status.isLoaded, previewPlayer]);

  const togglePreview = useCallback(
    (id: string, resolveUrl: () => Promise<string | null>) => {
      if (previewingId === id) {
        previewPlayer.pause();
        setTarget(null);
        return;
      }
      setPreviewLoadingId(id);
      void (async () => {
        let url: string | null = null;
        try {
          url = await resolveUrl();
        } catch (err) {
          console.warn("failed to resolve preview url", { id, err });
        }
        setPreviewLoadingId((curr) => (curr === id ? null : curr));
        if (!url) return;
        // Pause main playback so we don't play two things at once.
        if (mainPlaying) togglePlay();
        setTarget({ id, url });
      })();
    },
    [previewingId, mainPlaying, togglePlay, previewPlayer],
  );

  const previewProgress =
    previewingId && status.duration
      ? Math.min(status.currentTime / status.duration, 1)
      : 0;

  const value = useMemo<PreviewContextValue>(
    () => ({ previewingId, previewLoadingId, previewProgress, togglePreview }),
    [previewingId, previewLoadingId, previewProgress, togglePreview],
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
