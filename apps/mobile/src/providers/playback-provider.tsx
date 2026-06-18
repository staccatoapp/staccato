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
  PlaybackSessionSchema,
  type PlaybackSession,
  type PlaybackSource,
  type PlaybackTrack,
} from "@staccato/shared";

import { useAuthedMutation } from "@/hooks/use-authed-mutation";
import {
  PLAYBACK_SESSION_KEY,
  usePlaybackSession,
} from "@/hooks/use-playback-session";
import {
  computePlayDelta,
  getNextTrackState,
  getPrevTrackState,
} from "@/lib/playback";
import { useSession } from "@/lib/session";

/** Body of PUT /api/playback/session/state. */
interface PlaybackStateUpdate {
  isPlaying: boolean;
  currentTrackIndex: number;
  currentTrackPositionInSeconds: number;
  currentTrackAccumulatedPlayTimeInSeconds: number;
  currentTrackListenEventCreated?: boolean;
}

interface PlaybackContextValue {
  session: PlaybackSession | undefined;
  currentTrack: PlaybackTrack | null;
  isPlaying: boolean;
  /** Player position in seconds, at status-tick resolution. */
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
  /**
   * Replace the queue with the given tracks and start playing at startIndex.
   * `source` records where the queue was started from (album / in-library
   * playlist) so recorded listens are attributed for recently-played.
   */
  playTracks: (
    trackIds: string[],
    startIndex: number,
    source?: PlaybackSource,
  ) => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Owns the audio player and its relationship to the server playback session.
 * The server session is the source of truth (shared with the web client); this
 * provider drives the expo-audio player from it and reports state changes back
 * via PUT /session/state, including the listen-event play-time accounting
 * contract (see .claude/rules/listen-events.md): the accumulator only ever
 * advances by genuine playback deltas, so seeking and pausing never inflate it.
 */
export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const { session: authSession } = useSession();
  const { data: playbackSession } = usePlaybackSession();
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [isPlayerOpen, setPlayerOpen] = useState(false);

  const currentTrack =
    playbackSession?.trackQueue[playbackSession.currentTrackIndex] ?? null;

  const accumulatedPlayTimeRef = useRef(0);
  const lastTrackedAudioTimeRef = useRef<number | null>(null);

  // Latest-value refs so narrowly-keyed effects can read fresh state without
  // widening their dependency lists (web player-bar pattern). Synced in an
  // effect (not during render) to stay React-Compiler safe; effects run in
  // declaration order, so these are current before any effect below reads them.
  const playbackSessionRef = useRef(playbackSession);
  const currentTrackRef = useRef(currentTrack);
  const statusRef = useRef(status);
  useEffect(() => {
    playbackSessionRef.current = playbackSession;
    currentTrackRef.current = currentTrack;
    statusRef.current = status;
  });

  const stateMutation = useAuthedMutation<PlaybackSession, PlaybackStateUpdate>(
    PLAYBACK_SESSION_KEY,
    (client, vars) =>
      client.put("/api/playback/session/state", vars, PlaybackSessionSchema),
    { optimisticUpdate: (old, vars) => (old ? { ...old, ...vars } : old) },
  );
  const mutateState = stateMutation.mutate;

  // Start a brand-new queue (used by Explore to play an owned track in full).
  // The server filters/translates the queue, so we rely on the post-settle
  // refetch rather than an optimistic write.
  const playMutation = useAuthedMutation<
    PlaybackSession,
    { trackIds: string[]; startIndex: number; source?: PlaybackSource }
  >(PLAYBACK_SESSION_KEY, (client, vars) =>
    client.put("/api/playback/session/play", vars, PlaybackSessionSchema),
  );
  const mutatePlay = playMutation.mutate;

  // Audio mode: background playback with lock-screen controls requires
  // interruptionMode "doNotMix".
  useEffect(() => {
    setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
    }).catch((err) => {
      console.warn("failed to set audio mode", err);
    });
  }, []);

  // Track change: load the new source, restore position and accounting, and
  // refresh lock-screen metadata. Keyed on the track id only; everything else
  // is read through refs (web player-bar two-effect pattern).
  const currentTrackId = currentTrack?.id;
  useEffect(() => {
    const track = currentTrackRef.current;
    const session = playbackSessionRef.current;
    if (!track || !authSession) return;

    const position = session?.currentTrackPositionInSeconds ?? 0;
    player.replace({
      uri: `${authSession.serverUrl}/api/tracks/${track.id}/stream`,
      headers: { Authorization: `Bearer ${authSession.token}` },
    });
    player.seekTo(position).catch((err) => {
      console.warn("failed to seek after track load", {
        trackId: track.id,
        err,
      });
    });
    accumulatedPlayTimeRef.current =
      session?.currentTrackAccumulatedPlayTimeInSeconds ?? 0;
    lastTrackedAudioTimeRef.current = position;
    if (session?.isPlaying) player.play();

    // No artworkUrl yet: lock screens can't send the Bearer header that the
    // server-relative cover URLs require. Once the app caches album art
    // locally we can pass the cached file path here and artwork will render.
    try {
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artistName ?? undefined,
        albumTitle: track.albumTitle ?? undefined,
      });
    } catch (err) {
      console.warn("failed to set lock-screen metadata", {
        trackId: track.id,
        err,
      });
    }
  }, [currentTrackId, authSession, player]);

  // Play/pause sync: the session's isPlaying drives the player.
  const sessionIsPlaying = playbackSession?.isPlaying;
  useEffect(() => {
    if (!currentTrackRef.current) return;
    if (sessionIsPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [sessionIsPlaying, player]);

  // Accounting: advance the accumulator by genuine playback deltas only.
  useEffect(() => {
    if (status.playing) {
      accumulatedPlayTimeRef.current += computePlayDelta(
        lastTrackedAudioTimeRef.current,
        status.currentTime,
      );
    }
    lastTrackedAudioTimeRef.current = status.currentTime;
  }, [status.playing, status.currentTime]);

  // Track finished: advance the queue (or stop on the last track).
  useEffect(() => {
    if (!status.didJustFinish) return;
    const session = playbackSessionRef.current;
    if (!session) return;
    const nextState = getNextTrackState(
      session.currentTrackIndex,
      session.trackQueue.length,
    );
    if (nextState.currentTrackIndex === session.currentTrackIndex) {
      player.seekTo(0).catch((err) => {
        console.warn("failed to rewind after queue end", err);
      });
      lastTrackedAudioTimeRef.current = 0;
      accumulatedPlayTimeRef.current = 0;
    }
    mutateState(nextState);
  }, [status.didJustFinish, player, mutateState]);

  // Externally-initiated play/pause (lock screen, interruptions): when the
  // player's state flips without the session knowing, report it. Buffering is
  // excluded so a stall is never mistaken for a pause.
  const prevPlayingRef = useRef(false);
  useEffect(() => {
    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = status.playing;
    const session = playbackSessionRef.current;
    if (!session || status.isBuffering) return;
    const externallyPaused =
      wasPlaying &&
      !status.playing &&
      !status.didJustFinish &&
      session.isPlaying;
    const externallyResumed =
      !wasPlaying && status.playing && !session.isPlaying;
    if (!externallyPaused && !externallyResumed) return;
    mutateState({
      isPlaying: status.playing,
      currentTrackIndex: session.currentTrackIndex,
      currentTrackPositionInSeconds: Math.floor(status.currentTime),
      currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
        accumulatedPlayTimeRef.current,
      ),
    });
  }, [
    status.playing,
    status.isBuffering,
    status.didJustFinish,
    status.currentTime,
    mutateState,
  ]);

  // Periodic sync while playing, so the server can fire the listen event and
  // other clients see fresh position (web parity: 5s cadence).
  useEffect(() => {
    const interval = setInterval(() => {
      const st = statusRef.current;
      const session = playbackSessionRef.current;
      if (!st.playing || !session) return;
      mutateState({
        isPlaying: true,
        currentTrackIndex: session.currentTrackIndex,
        currentTrackPositionInSeconds: Math.floor(st.currentTime),
        currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
          accumulatedPlayTimeRef.current,
        ),
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [mutateState]);

  const togglePlay = useCallback(() => {
    if (!playbackSession) return;
    mutateState({
      isPlaying: !playbackSession.isPlaying,
      currentTrackIndex: playbackSession.currentTrackIndex,
      currentTrackPositionInSeconds: Math.floor(player.currentTime),
      currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
        accumulatedPlayTimeRef.current,
      ),
    });
  }, [playbackSession, mutateState, player]);

  const next = useCallback(() => {
    if (!playbackSession) return;
    const nextState = getNextTrackState(
      playbackSession.currentTrackIndex,
      playbackSession.trackQueue.length,
    );
    if (nextState.currentTrackIndex === playbackSession.currentTrackIndex) {
      player.seekTo(0).catch((err) => {
        console.warn("failed to rewind on next at queue end", err);
      });
      lastTrackedAudioTimeRef.current = 0;
      accumulatedPlayTimeRef.current = 0;
    }
    mutateState(nextState);
  }, [playbackSession, mutateState, player]);

  const prev = useCallback(() => {
    if (!playbackSession) return;
    const prevState = getPrevTrackState(
      playbackSession.currentTrackIndex,
      Math.floor(player.currentTime),
      playbackSession.isPlaying,
      Math.floor(accumulatedPlayTimeRef.current),
    );
    if (prevState.currentTrackIndex === playbackSession.currentTrackIndex) {
      player.seekTo(0).catch((err) => {
        console.warn("failed to rewind on prev", err);
      });
      lastTrackedAudioTimeRef.current = 0;
      accumulatedPlayTimeRef.current =
        prevState.currentTrackAccumulatedPlayTimeInSeconds;
    }
    mutateState(prevState);
  }, [playbackSession, mutateState, player]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!playbackSession) return;
      player.seekTo(seconds).catch((err) => {
        console.warn("failed to seek", { seconds, err });
      });
      lastTrackedAudioTimeRef.current = seconds;
      mutateState({
        isPlaying: playbackSession.isPlaying,
        currentTrackIndex: playbackSession.currentTrackIndex,
        currentTrackPositionInSeconds: Math.floor(seconds),
        currentTrackAccumulatedPlayTimeInSeconds: Math.floor(
          accumulatedPlayTimeRef.current,
        ),
      });
    },
    [playbackSession, mutateState, player],
  );

  const jumpToIndex = useCallback(
    (index: number) => {
      if (!playbackSession) return;
      if (index < 0 || index >= playbackSession.trackQueue.length) return;
      mutateState({
        isPlaying: true,
        currentTrackIndex: index,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: 0,
        currentTrackListenEventCreated: false,
      });
    },
    [playbackSession, mutateState],
  );

  const playTracks = useCallback(
    (trackIds: string[], startIndex: number, source?: PlaybackSource) => {
      if (trackIds.length === 0) return;
      mutatePlay({ trackIds, startIndex, source });
    },
    [mutatePlay],
  );

  const value = useMemo<PlaybackContextValue>(
    () => ({
      session: playbackSession,
      currentTrack,
      isPlaying: playbackSession?.isPlaying ?? false,
      position: status.currentTime,
      duration: status.duration || currentTrack?.durationSeconds || 0,
      isPlayerOpen,
      setPlayerOpen,
      togglePlay,
      next,
      prev,
      seekTo,
      jumpToIndex,
      playTracks,
    }),
    [
      playbackSession,
      currentTrack,
      status.currentTime,
      status.duration,
      isPlayerOpen,
      togglePlay,
      next,
      prev,
      seekTo,
      jumpToIndex,
      playTracks,
    ],
  );

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used inside a PlaybackProvider");
  }
  return context;
}
