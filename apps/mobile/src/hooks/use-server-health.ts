import { HealthResponseSchema, type HealthResponse } from "@staccato/shared";

import { useAuthedQuery } from "./use-authed-query";

/** Server identity + version, surfaced in About / Maintenance. */
export function useServerHealth() {
  return useAuthedQuery<HealthResponse>(
    ["health"],
    "/api/health",
    HealthResponseSchema,
    { staleTime: 60 * 60 * 1000 },
  );
}
