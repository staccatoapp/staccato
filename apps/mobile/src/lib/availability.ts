import type { UnifiedAlbumDetail } from "@staccato/shared";

import { useCollectionStatus } from "@/stores/downloads-store";

/**
 * Whether an album/playlist is on the device, owned, partly owned, or merely
 * recommended. The single shared notion of availability across every surface
 * that renders album/playlist art (heroes, tiles, rails) — replacing the
 * per-screen chip logic that used to live in the album and playlist heroes.
 */
export type AvailabilityState =
  | "downloaded"
  | "inLibrary"
  | "partial"
  | "recommended";

/**
 * The server-derivable subset — what the API data tells us, before layering on
 * the device-download state (which only {@link useResolvedAvailability} knows).
 */
export type ServerAvailability = Exclude<AvailabilityState, "downloaded">;

/**
 * Album availability from a {@link UnifiedAlbumDetail}: external albums are
 * recommended (owned by nobody), local albums are partial while any track is
 * still pending a match, otherwise fully in library.
 */
export function albumServerAvailability(
  detail: UnifiedAlbumDetail,
): ServerAvailability {
  if (detail.source === "external") return "recommended";
  return availabilityFromPending(detail.album.pendingTrackCount);
}

/**
 * Availability for an owned list item (library album, in-library discography
 * entry) keyed off its unresolved-track count: any pending → partial.
 */
export function availabilityFromPending(
  pendingTrackCount: number,
): ServerAvailability {
  return pendingTrackCount > 0 ? "partial" : "inLibrary";
}

/**
 * Count-driven availability for playlists and recommended playlists: nothing
 * owned → recommended, some owned → partial, all owned (or empty) → inLibrary.
 */
export function availabilityFromCounts(
  localCount: number,
  total: number,
): ServerAvailability {
  if (total > 0 && localCount === 0) return "recommended";
  if (localCount < total) return "partial";
  return "inLibrary";
}

/**
 * Layer the device-download state on top of a server-derived availability: a
 * fully-downloaded collection always reads as "downloaded" (online or offline).
 * Pass `undefined` for non-downloadable content (recommended/external) — the
 * store returns an idle status for the empty id, so it never resolves to
 * "downloaded".
 */
export function useResolvedAvailability(
  collectionId: string | undefined,
  base: ServerAvailability,
): AvailabilityState {
  const status = useCollectionStatus(collectionId ?? "");
  return status.state === "downloaded" ? "downloaded" : base;
}
