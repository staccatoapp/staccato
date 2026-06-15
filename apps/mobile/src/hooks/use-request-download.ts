import {
  DownloadRequestSchema,
  type CreateDownloadRequest,
  type DownloadRequest,
} from "@staccato/shared";

import { useAuthedMutation } from "./use-authed-mutation";

/**
 * Queues a Lidarr download request (`POST /api/downloads`). Album-level: the
 * server needs a `releaseGroupMbid` + `artistMbid`, so callers only open the
 * request affordance for items that carry both. Omitting `qualityProfileId`
 * lets the server fall back to its configured default (the profile-list
 * endpoint is admin-only and not reachable by most mobile users).
 *
 * A duplicate active request surfaces as an {@link ApiError} with status 409;
 * callers treat that as a benign "already requested" outcome.
 */
export function useRequestDownload() {
  return useAuthedMutation<DownloadRequest, CreateDownloadRequest>(
    ["downloads"],
    (client, vars) =>
      client.post("/api/downloads", vars, DownloadRequestSchema),
  );
}
