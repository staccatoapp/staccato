import type { SyncedLyricsLine } from "@staccato/shared";

/**
 * Player UI formatting helpers for the mobile playback views. The shared
 * track-transition + play-time accounting logic now lives in
 * `@staccato/shared` (playback/transitions + playback/controller).
 */

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
