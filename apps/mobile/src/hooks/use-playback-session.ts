import { PlaybackSessionSchema } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

export const PLAYBACK_SESSION_KEY = ["playback-session"];

/**
 * The shared server-side playback session (queue + position + play state).
 * Polls every 5s while playing so cross-client changes (e.g. from the web
 * player) are picked up, mirroring the web player-bar behaviour.
 */
export function usePlaybackSession() {
  return useAuthedQuery(
    PLAYBACK_SESSION_KEY,
    "/api/playback/session",
    PlaybackSessionSchema,
    {
      refetchInterval: (query) => (query.state.data?.isPlaying ? 5000 : false),
    },
  );
}
