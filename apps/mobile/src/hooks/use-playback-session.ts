import { PlaybackSessionSchema } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

export const PLAYBACK_SESSION_KEY = ["playback-session"];

/**
 * The shared server-side playback session (queue + position + play state).
 * Fetched once on mount as a fast first paint; subsequent updates arrive over
 * the playback WebSocket (see {@link usePlaybackSocket}), which writes straight
 * into this query's cache. No polling — the socket is the live channel.
 */
export function usePlaybackSession() {
  return useAuthedQuery(
    PLAYBACK_SESSION_KEY,
    "/api/playback/session",
    PlaybackSessionSchema,
  );
}
