import { z } from "zod";

import { useAuthedMutation } from "./use-authed-mutation";

interface AddTrackVariables {
  playlistId: string;
  trackId: string;
}

/**
 * Appends a single owned track to a playlist via
 * `POST /api/playlists/:id/tracks` (204). On success it invalidates the three
 * key families that surface playlist data so their track counts/lists refresh:
 * `["playlists"]` (home screen), `["library","playlists"]` (Library tab and the
 * add-to-playlist sheet's own list), and `["playlist", playlistId]` (the detail
 * screen for the playlist that was added to). The server owns ordering and
 * validation; we only need to confirm the empty 204 body.
 */
export function useAddTrackToPlaylist() {
  return useAuthedMutation<null, AddTrackVariables>(
    ["playlists"],
    (client, { playlistId, trackId }) =>
      client.post(
        `/api/playlists/${playlistId}/tracks`,
        { trackIds: [trackId] },
        z.null(),
      ),
    {
      invalidateKeys: ({ playlistId }) => [
        ["library", "playlists"],
        ["playlist", playlistId],
      ],
    },
  );
}
