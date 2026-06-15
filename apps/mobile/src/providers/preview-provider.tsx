import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSession } from "@/lib/session";

import { usePlayback } from "./playback-provider";

// Backstop: if a clip neither loads nor errors within this window, treat it as
// unavailable. The /stream proxy 404s when no Deezer/iTunes preview exists, so
// it normally surfaces as a load error well before this fires.
const PREVIEW_LOAD_TIMEOUT_MS = 8000;

interface Target {
  id: string;
  artistName: string;
  title: string;
}

interface PreviewContextValue {
  /** recordingMbid of the track currently previewing, or null. */
  previewingId: string | null;
  /** recordingMbid whose preview clip is loading, or null. */
  previewLoadingId: string | null;
  /** Progress of the current preview, 0..1 (0 when nothing is previewing). */
  previewProgress: number;
  /**
   * True once a track's preview has been confirmed unavailable this session
   * (the /stream proxy had no clip to serve). Not persisted — reset on reload.
   */
  isPreviewUnavailable: (id: string) => boolean;
  /**
   * Toggle a 30-second preview for `id`. Passing the already-previewing id stops
   * it; otherwise the clip is streamed through the server preview proxy
   * (`GET /api/preview/:id/stream`), which resolves a fresh upstream url and
   * self-heals stale, time-limited ones — so the client never plays an expired
   * CDN url directly. Main playback is paused while a preview plays so the two
   * audio sources never overlap.
   */
  togglePreview: (id: string, artistName: string, title: string) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Owns a second, independent audio player dedicated to Explore's 30-second
 * previews. Kept separate from {@link PlaybackProvider} so a preview never
 * touches the server playback session; the only interaction is pausing the main
 * player when a preview begins. Must be mounted inside a PlaybackProvider and a
 * SessionProvider.
 */
export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const previewPlayer = useAudioPlayer();
  const status = useAudioPlayerStatus(previewPlayer);
  const { isPlaying: mainPlaying, togglePlay } = usePlayback();
  const { session } = useSession();

  // The clip we want to be playing, or null when stopped.
  const [target, setTarget] = useState<Target | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // A finished clip reverts the row to its play icon without a state write:
  // once the player reports `didJustFinish`, the target no longer counts as
  // "previewing", and a subsequent tap on the same row replays it.
  const previewingId = status.didJustFinish ? null : (target?.id ?? null);

  const markUnavailable = useCallback(
    (id: string) => {
      previewPlayer.pause();
      setUnavailableIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setTarget((curr) => (curr?.id === id ? null : curr));
      setPreviewLoadingId((curr) => (curr === id ? null : curr));
    },
    [previewPlayer],
  );

  // Load the clip through the preview proxy, start it, and resolve its outcome
  // from the player's own status events. Streaming through /stream (rather than
  // a raw, time-limited CDN url) lets the server re-resolve a stale upstream, so
  // previews keep working. Mirrors PlaybackProvider's authed
  // `replace({ uri, headers })`: native players send no session cookie, so the
  // server-relative url is absolutised against the session and carries the
  // bearer token. Subscribing per-target means the listener only ever sees this
  // clip's status, never a stale snapshot of the previous one.
  useEffect(() => {
    if (!target || !session) return;
    const id = target.id;
    const base = session.serverUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({
      artistName: target.artistName,
      trackTitle: target.title,
    });
    previewPlayer.replace({
      uri: `${base}/api/preview/${encodeURIComponent(id)}/stream?${params.toString()}`,
      headers: { Authorization: `Bearer ${session.token}` },
    });
    previewPlayer.play();

    const timeout = setTimeout(
      () => markUnavailable(id),
      PREVIEW_LOAD_TIMEOUT_MS,
    );
    // Re-assert play() exactly once after the clip loads: a play() issued on the
    // same tick as replace() races ahead of the native load and is dropped.
    let started = false;
    const sub = previewPlayer.addListener("playbackStatusUpdate", (s) => {
      if (s.error) {
        clearTimeout(timeout);
        console.warn("preview failed to load", { id, error: s.error });
        markUnavailable(id);
        return;
      }
      if (!started && s.isLoaded) {
        started = true;
        clearTimeout(timeout);
        setPreviewLoadingId((curr) => (curr === id ? null : curr));
        previewPlayer.play();
      }
    });

    return () => {
      clearTimeout(timeout);
      sub.remove();
    };
  }, [target, session, previewPlayer, markUnavailable]);

  const togglePreview = useCallback(
    (id: string, artistName: string, title: string) => {
      if (previewingId === id) {
        previewPlayer.pause();
        setTarget(null);
        setPreviewLoadingId(null);
        return;
      }
      if (unavailableIds.has(id)) return;
      // Pause main playback so we don't play two things at once.
      if (mainPlaying) togglePlay();
      setPreviewLoadingId(id);
      setTarget({ id, artistName, title });
    },
    [previewingId, unavailableIds, mainPlaying, togglePlay, previewPlayer],
  );

  const isPreviewUnavailable = useCallback(
    (id: string) => unavailableIds.has(id),
    [unavailableIds],
  );

  const previewProgress =
    previewingId && status.duration
      ? Math.min(status.currentTime / status.duration, 1)
      : 0;

  const value = useMemo<PreviewContextValue>(
    () => ({
      previewingId,
      previewLoadingId,
      previewProgress,
      isPreviewUnavailable,
      togglePreview,
    }),
    [
      previewingId,
      previewLoadingId,
      previewProgress,
      isPreviewUnavailable,
      togglePreview,
    ],
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
