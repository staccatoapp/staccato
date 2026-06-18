import {
  RecentlyPlayedResponseSchema,
  type RecentlyPlayedItem,
  type RecentlyPlayedResponse,
} from "@staccato/shared";

import { type HomeAlbum, type HomePlaylist } from "@/lib/home-types";
import { pickGradient } from "@/lib/gradient";
import { useAuthedQuery } from "./use-authed-query";

/**
 * Map the recently-played API items onto the `HomeAlbum | HomePlaylist` union
 * the QuickStartGrid consumes (it discriminates on `"title" in item`). Order is
 * preserved — the API already returns items most-recent first.
 */
export function recentlyPlayedToHomeItems(
  items: RecentlyPlayedItem[],
): (HomeAlbum | HomePlaylist)[] {
  return items.map((item) =>
    item.kind === "album"
      ? {
          id: item.id,
          title: item.title,
          artistName: item.artistName,
          // The grid shows the artist, not the year; 0 is a harmless fallback.
          releaseYear: item.releaseYear ?? 0,
          gradientKey: pickGradient(item.id),
          artUrl: item.coverArtUrl,
        }
      : {
          id: item.id,
          name: item.name,
          trackCount: item.trackCount,
          gradientKey: pickGradient(item.id),
          artUrls: item.coverArtUrls,
        },
  );
}

/**
 * The user's six most recently played albums / in-library playlists, shaped for
 * the home QuickStartGrid. Returns an empty list while loading or if the user
 * has no attributed plays yet.
 */
export function useRecentlyPlayed(): (HomeAlbum | HomePlaylist)[] {
  const { data } = useAuthedQuery<RecentlyPlayedResponse>(
    ["recently-played"],
    "/api/recently-played",
    RecentlyPlayedResponseSchema,
    { staleTime: 60 * 1000 },
  );
  return recentlyPlayedToHomeItems(data?.items ?? []);
}
