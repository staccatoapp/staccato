/**
 * Pure track-transition + play-time accounting helpers shared by the web and
 * mobile playback clients (and the {@link PlaybackController}). Honour the
 * listen-event contract (see .claude/rules/listen-events.md): accumulated play
 * time only ever advances by genuine playback deltas, never by seeks or pauses.
 */

/** Largest believable position delta (seconds) between two status ticks.
 *  Anything bigger is a seek, not playback. */
export const MAX_PLAYBACK_DELTA_SECONDS = 5;

/** Tapping "previous" within this many seconds goes to the previous track;
 *  after it, it restarts the current one. */
const PREV_RESTART_THRESHOLD_SECONDS = 3;

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

export interface TrackChangeState {
  isPlaying: boolean;
  currentTrackIndex: number;
  currentTrackPositionInSeconds: number;
  currentTrackAccumulatedPlayTimeInSeconds: number;
  currentTrackListenEventCreated: boolean;
}

/** Advance to the next track, or stop on the last one. */
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
 * otherwise go back one track. Restarting the same track keeps the accumulated
 * play time — it is one continuous listen.
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
    currentTrackAccumulatedPlayTimeInSeconds: isSameTrack
      ? accumulatedPlayTimeSeconds
      : 0,
    currentTrackListenEventCreated: false,
  };
}
