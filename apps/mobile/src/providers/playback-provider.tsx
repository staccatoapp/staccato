import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PlaybackController,
  type ClientMessage,
  type PlaybackSession,
  type PlaybackTrack,
  type PlaybackViewState,
  type PlayerAdapter,
} from "@staccato/shared";

import { usePlaybackSession } from "@/hooks/use-playback-session";
import { usePlaybackSocket } from "@/hooks/use-playback-socket";
import { useSession } from "@/lib/session";

interface PlaybackContextValue {
  session: PlaybackSession | undefined;
  currentTrack: PlaybackTrack | null;
  isPlaying: boolean;
  /** Player position in seconds (active: live; passive: interpolated). */
  position: number;
  /** Track duration in seconds (player-reported, metadata fallback). */
  duration: number;
  isPlayerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (seconds: number) => void;
  jumpToIndex: (index: number) => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

const HEARTBEAT_MS = 500;

const INITIAL_VIEW: PlaybackViewState = {
  isActiveDevice: false,
  isPlaying: false,
  currentTrackIndex: 0,
  displayPositionSeconds: 0,
  durationSeconds: 0,
};

/**
 * Owns the expo-audio player and binds it to the shared Staccato Connect
 * {@link PlaybackController}. All active/passive playback logic lives in the
 * controller (and is unit-tested in @staccato/shared); this provider supplies a
 * thin expo-audio {@link PlayerAdapter}, feeds player status into the controller,
 * and exposes the rendered view state + transport dispatchers to the UI.
 */
export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { session: authSession } = useSession();
  const { data: playbackSession } = usePlaybackSession();
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [isPlayerOpen, setPlayerOpen] = useState(false);
  const [view, setView] = useState<PlaybackViewState>(INITIAL_VIEW);

  // Latest-value refs the framework-agnostic adapter + send closure read at call
  // time, plus the controller itself. All reads/writes happen in effects or
  // callbacks (never during render) to stay React-Compiler safe.
  const authSessionRef = useRef(authSession);
  const durationRef = useRef<number | null>(null);
  const sendRef = useRef<(m: ClientMessage) => void>(() => {});
  const controllerRef = useRef<PlaybackController | null>(null);

  const { send } = usePlaybackSocket(
    useCallback((m) => controllerRef.current?.onServerMessage(m), []),
  );

  // Keep the value refs fresh for the adapter/send closures.
  useEffect(() => {
    authSessionRef.current = authSession;
    durationRef.current =
      status.duration != null && Number.isFinite(status.duration)
        ? status.duration
        : null;
    sendRef.current = send;
  });

  // Create the controller once on mount and subscribe its view state into React.
  useEffect(() => {
    const controller = new PlaybackController({
      adapter: createExpoAdapter(
        player,
        () => authSessionRef.current,
        () => durationRef.current,
      ),
      send: (m) => sendRef.current(m),
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setView);
    return () => {
      unsubscribe();
      controllerRef.current = null;
    };
  }, [player]);

  // Heartbeat: active-device reporting + passive display advancement.
  useEffect(() => {
    const id = setInterval(
      () => controllerRef.current?.heartbeat(),
      HEARTBEAT_MS,
    );
    return () => clearInterval(id);
  }, []);

  // Audio mode: background playback with lock-screen controls.
  useEffect(() => {
    setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
    }).catch((err) => {
      console.warn("failed to set audio mode", err);
    });
  }, []);

  const currentTrack =
    playbackSession?.trackQueue[playbackSession.currentTrackIndex] ?? null;
  const currentTrackId = currentTrack?.id;

  // Track finished → controller advances the queue (active device only, gated
  // inside the controller).
  useEffect(() => {
    if (status.didJustFinish) controllerRef.current?.onEnded();
  }, [status.didJustFinish]);

  // External (lock-screen / interruption) play-pause flips. Buffering is
  // excluded so a stall is never mistaken for a pause; the controller ignores
  // events that merely echo its own intent.
  useEffect(() => {
    if (status.isBuffering) return;
    controllerRef.current?.onExternalPlayPause(status.playing);
  }, [status.playing, status.isBuffering]);

  // Load-race retry (expo-audio quirk): a play() issued before the source
  // finished loading is dropped and nothing re-fires it. Re-issue once ready,
  // but only until it has actually started, so a deliberate external pause is
  // never overridden.
  const hasStartedSinceLoadRef = useRef(false);
  useEffect(() => {
    hasStartedSinceLoadRef.current = false;
  }, [currentTrackId]);
  useEffect(() => {
    if (status.playing) hasStartedSinceLoadRef.current = true;
  }, [status.playing]);
  useEffect(() => {
    if (!view.isActiveDevice || !view.isPlaying) return;
    if (!status.isLoaded || status.isBuffering || status.playing) return;
    if (hasStartedSinceLoadRef.current) return;
    player.play();
  }, [
    view.isActiveDevice,
    view.isPlaying,
    status.isLoaded,
    status.isBuffering,
    status.playing,
    player,
  ]);

  // Lock-screen metadata for the active device's current track. No artworkUrl
  // yet: lock screens can't send the Bearer header the cover URLs require.
  // Arming and disarming are symmetric: when this device goes passive (or loses
  // its track) the controls are torn down, otherwise a stale lock screen would
  // call player.play() on a passive device after a handoff and blip audio (SC-7).
  useEffect(() => {
    if (view.isActiveDevice && currentTrack) {
      try {
        player.setActiveForLockScreen(true, {
          title: currentTrack.title,
          artist: currentTrack.artistName ?? undefined,
          albumTitle: currentTrack.albumTitle ?? undefined,
        });
      } catch (err) {
        console.warn("failed to set lock-screen metadata", {
          trackId: currentTrack.id,
          err,
        });
      }
    } else {
      try {
        player.setActiveForLockScreen(false);
      } catch (err) {
        console.warn("failed to clear lock-screen controls", { err });
      }
    }
  }, [view.isActiveDevice, currentTrackId, currentTrack, player]);

  const togglePlay = useCallback(
    () =>
      controllerRef.current?.command({
        kind: "setPlaying",
        value: !view.isPlaying,
      }),
    [view.isPlaying],
  );
  const next = useCallback(
    () => controllerRef.current?.command({ kind: "next" }),
    [],
  );
  const prev = useCallback(
    () => controllerRef.current?.command({ kind: "prev" }),
    [],
  );
  const seekTo = useCallback(
    (seconds: number) =>
      controllerRef.current?.command({
        kind: "seek",
        positionSeconds: seconds,
      }),
    [],
  );
  const jumpToIndex = useCallback(
    (index: number) =>
      controllerRef.current?.command({ kind: "jumpToIndex", index }),
    [],
  );

  const duration = view.durationSeconds || currentTrack?.durationSeconds || 0;

  const value = useMemo<PlaybackContextValue>(
    () => ({
      session: playbackSession,
      currentTrack,
      isPlaying: view.isPlaying,
      position: view.displayPositionSeconds,
      duration,
      isPlayerOpen,
      setPlayerOpen,
      togglePlay,
      next,
      prev,
      seekTo,
      jumpToIndex,
    }),
    [
      playbackSession,
      currentTrack,
      view.isPlaying,
      view.displayPositionSeconds,
      duration,
      isPlayerOpen,
      togglePlay,
      next,
      prev,
      seekTo,
      jumpToIndex,
    ],
  );

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

/** Adapts the expo-audio player to the shared PlayerAdapter. The auth/duration
 *  getters are read at call time, never during render. */
function createExpoAdapter(
  player: ReturnType<typeof useAudioPlayer>,
  getAuth: () => { serverUrl: string; token: string } | null,
  getDuration: () => number | null,
): PlayerAdapter {
  return {
    load(trackId) {
      const auth = getAuth();
      if (!auth) return;
      player.replace({
        uri: `${auth.serverUrl}/api/tracks/${trackId}/stream`,
        headers: { Authorization: `Bearer ${auth.token}` },
      });
    },
    play() {
      player.play();
    },
    pause() {
      player.pause();
    },
    seek(seconds) {
      player.seekTo(seconds).catch((err) => {
        console.warn("failed to seek", { seconds, err });
      });
    },
    getPosition() {
      return player.currentTime ?? 0;
    },
    getDuration() {
      return getDuration();
    },
  };
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used inside a PlaybackProvider");
  }
  return context;
}
