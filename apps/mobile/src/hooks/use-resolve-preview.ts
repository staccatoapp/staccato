import { useCallback } from "react";
import { PreviewResolutionSchema } from "@staccato/shared";

import { useApiClient } from "./use-api-client";

/**
 * Returns a function that lazily resolves a 30-second preview url for a
 * recording via `GET /api/preview/:recordingMbid` (used by search results, which
 * carry no inline previewUrl). Resolves to null when none is available or when
 * unauthenticated.
 */
export function useResolvePreview() {
  const client = useApiClient();
  return useCallback(
    async (
      recordingMbid: string,
      artistName: string,
      trackTitle: string,
    ): Promise<string | null> => {
      if (!client) return null;
      const params = new URLSearchParams({ artistName, trackTitle });
      const { previewUrl } = await client.get(
        `/api/preview/${encodeURIComponent(recordingMbid)}?${params.toString()}`,
        PreviewResolutionSchema,
      );
      return previewUrl;
    },
    [client],
  );
}
