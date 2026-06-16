import { ScanProgressSchema, type ScanProgress } from "@staccato/shared";
import { z } from "zod";

import { useAuthedMutation } from "./use-authed-mutation";
import { useAuthedQuery } from "./use-authed-query";

const ScanStartedSchema = z.object({ message: z.string() });

/** Library scan progress; polls every 2s while a scan is running. */
export function useScanStatus(enabled = true) {
  return useAuthedQuery<ScanProgress>(
    ["scan-status"],
    "/api/admin/scan/status",
    ScanProgressSchema,
    {
      enabled,
      refetchInterval: (query) =>
        query.state.data?.running ? 2000 : (false as const),
    },
  );
}

/** Triggers a library scan; invalidates the status query so polling resumes. */
export function useTriggerScan() {
  return useAuthedMutation<{ message: string }, void>(
    ["scan-status"],
    (client) => client.post("/api/admin/scan", undefined, ScanStartedSchema),
  );
}
