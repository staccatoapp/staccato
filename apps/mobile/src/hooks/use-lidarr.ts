import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LidarrOptionsSchema,
  LidarrSettingsSchema,
  LidarrTestResultSchema,
  type LidarrOptions,
  type LidarrSettings,
  type LidarrTestResult,
  type TestLidarrConnection,
  type UpdateLidarrSettings,
} from "@staccato/shared";
import { z } from "zod";

import { useApiClient } from "./use-api-client";
import { useAuthedQuery } from "./use-authed-query";

const ConnectivitySchema = z.object({ connected: z.boolean() });

/** Stored Lidarr settings (admin only). */
export function useLidarrSettings() {
  return useAuthedQuery<LidarrSettings>(
    ["lidarr-settings"],
    "/api/admin/lidarr",
    LidarrSettingsSchema,
  );
}

/** Live Lidarr dropdown options; only fetched once a connection is configured. */
export function useLidarrOptions(enabled: boolean) {
  return useAuthedQuery<LidarrOptions>(
    ["lidarr-options"],
    "/api/admin/lidarr/options",
    LidarrOptionsSchema,
    { enabled, staleTime: 5 * 60 * 1000 },
  );
}

/** Connectivity ping against the stored Lidarr config. */
export function useLidarrConnectivity(enabled: boolean) {
  return useAuthedQuery<z.infer<typeof ConnectivitySchema>>(
    ["lidarr-connectivity"],
    "/api/admin/lidarr/connectivity",
    ConnectivitySchema,
    { enabled },
  );
}

/** Tests an explicit URL + API key, returning live options on success. */
export function useTestLidarr() {
  const client = useApiClient();
  return useMutation<LidarrTestResult, Error, TestLidarrConnection>({
    mutationFn: (body) => {
      if (!client) throw new Error("not authenticated");
      return client.post(
        "/api/admin/lidarr/test",
        body,
        LidarrTestResultSchema,
      );
    },
  });
}

/** Persists Lidarr settings; invalidates settings, options and connectivity. */
export function useSaveLidarr() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<null, Error, UpdateLidarrSettings>({
    mutationFn: (body) => {
      if (!client) throw new Error("not authenticated");
      return client.patch("/api/admin/lidarr", body, z.null());
    },
    onSuccess: () => {
      // Base keys match the serverUrl-namespaced query keys by prefix.
      for (const key of [
        ["lidarr-settings"],
        ["lidarr-options"],
        ["lidarr-connectivity"],
      ]) {
        queryClient.invalidateQueries({ queryKey: key }).catch(() => {
          /* refetch failures surface via the query itself */
        });
      }
    },
  });
}
