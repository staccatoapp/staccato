import type { SyncedLyricsLine } from "@staccato/shared";

/**
 * Pure playback/session logic shared by the playback provider and player UI.
 * Mirrors the web player-bar semantics (apps/web player-bar.tsx) and the
 * listen-event accounting contract: accumulated play time only ever advances
 * by genuine playback deltas, never by seeks or pauses.
 */

/** Largest believable position delta (seconds) between two status ticks.
 *  Anything bigger is a seek, not playback. */
const MAX_PLAYBACK_DELTA_SECONDS = 5;

/** Tapping "previous" within this many seconds goes to the previous track;
 *  after it, it restarts the current one. */
const PREV_RESTART_THRESHOLD_SECONDS = 3;

/** "m:ss" for player time labels (floored, clamped at zero). */
export function formatPlayerTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** The latest lyric line whose timestamp has been reached. */
export function getActiveLyricIndex(
  lines: SyncedLyricsLine[],
  positionSeconds: number,
): number {
  let active = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startingTime <= positionSeconds) active = i;
    else break;
  }
  return active;
}

/**
 * How much genuine play time elapsed between two position samples. Returns 0
 * for backwards movement or jumps too large to be playback (both are seeks).
 */
export function computePlayDelta(
  previousSeconds: number | null,
  currentSeconds: number,
): number {
  if (previousSeconds === null) return 0;
  const delta = currentSeconds - previousSeconds;
  if (delta <= 0 || delta > MAX_PLAYBACK_DELTA_SECONDS) return 0;
  return delta;
}

interface TrackChangeState {
  isPlaying: boolean;
  currentTrackIndex: number;
  currentTrackPositionInSeconds: number;
  currentTrackAccumulatedPlayTimeInSeconds: number;
  currentTrackListenEventCreated: boolean;
}

/** Advance to the next track, or stop on the last one (web parity). */
export function getNextTrackState(
  currentIndex: number,
  queueLength: number,
): TrackChangeState {
  const nextIndex = currentIndex + 1;
  const isLastTrack = nextIndex >= queueLength;
  return {
    isPlaying: !isLastTrack,
    currentTrackIndex: isLastTrack ? currentIndex : nextIndex,
    currentTrackPositionInSeconds: 0,
    currentTrackAccumulatedPlayTimeInSeconds: 0,
    currentTrackListenEventCreated: false,
  };
}

/**
 * "Previous" semantics: restart the current track when more than 3s in,
 * otherwise go back one track. Restarting the same track keeps the
 * accumulated play time — it is one continuous listen.
 */
export function getPrevTrackState(
  currentIndex: number,
  positionSeconds: number,
  isPlaying: boolean,
  accumulatedPlayTimeSeconds: number,
): TrackChangeState {
  if (positionSeconds > PREV_RESTART_THRESHOLD_SECONDS) {
    return {
      isPlaying,
      currentTrackIndex: currentIndex,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    };
  }
  const prevIndex = Math.max(0, currentIndex - 1);
  const isSameTrack = prevIndex === currentIndex;
  return {
    isPlaying,
    currentTrackIndex: prevIndex,
    currentTrackPositionInSeconds: 0,
    // Same track means one continuous listen, so the accumulator survives.
    currentTrackAccumulatedPlayTimeInSeconds: isSameTrack
      ? accumulatedPlayTimeSeconds
      : 0,
    currentTrackListenEventCreated: false,
  };
}
