import { displayHost } from "@staccato/shared";

/**
 * Pure view-model helpers for the Settings screens. Keeping the
 * label/formatting logic here (and unit-tested) keeps the screen components
 * thin and presentational.
 */

/** Role chip / value text for a user. */
export function roleLabel(isAdmin: boolean): "Admin" | "User" {
  return isAdmin ? "Admin" : "User";
}

/** Scheme-stripped host for the "Instance" row (e.g. music.home.lan). */
export function instanceHost(serverUrl: string): string {
  return displayHost(serverUrl);
}

/** First letter for an avatar tile; falls back to "?" for empty names. */
export function userInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || "?";
}

/** ListenBrainz connection status from the stored-token flag. */
export function listenBrainzStatusLabel(
  tokenSet: boolean,
): "Connected" | "Not connected" {
  return tokenSet ? "Connected" : "Not connected";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Member since" value, e.g. "Jan 2025". */
export function memberSince(createdAt: Date): string {
  return `${MONTHS[createdAt.getMonth()]} ${createdAt.getFullYear()}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Human "last scan" label from the scan status `completedAt` ISO timestamp.
 * `now` is injectable so the formatting is deterministic in tests.
 */
export function formatLastScan(
  completedAt: string | null,
  now: Date = new Date(),
): string {
  if (!completedAt) return "Never";
  const then = new Date(completedAt);
  const diff = now.getTime() - then.getTime();
  if (Number.isNaN(diff) || diff < 0) return "Just now";
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return `${MONTHS[then.getMonth()]} ${then.getDate()}, ${then.getFullYear()}`;
}
