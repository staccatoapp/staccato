import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { DownloadRequestArraySchema } from "@staccato/shared";
import type { DownloadRequest, DownloadRequestStatus } from "@staccato/shared";

const NON_TERMINAL: ReadonlySet<DownloadRequestStatus> = new Set([
  "requested",
  "sent_to_lidarr",
  "downloading",
]);

export type UiDownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed";

export function toUiStatus(status: DownloadRequestStatus): UiDownloadStatus {
  if (status === "requested" || status === "sent_to_lidarr") return "pending";
  return status;
}

export function useDownloads() {
  const query = useQuery({
    queryKey: ["downloads"],
    queryFn: async (): Promise<DownloadRequest[]> => {
      const res = await fetch("/api/downloads");
      if (!res.ok) throw new Error("Failed to fetch downloads");
      return DownloadRequestArraySchema.parse(await res.json());
    },
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return data.some((r) => NON_TERMINAL.has(r.status)) ? 30_000 : false;
    },
  });

  const byReleaseGroup = useMemo(() => {
    const map = new Map<string, DownloadRequest>();
    for (const r of query.data ?? []) {
      const existing = map.get(r.releaseGroupMbid);
      if (!existing) {
        map.set(r.releaseGroupMbid, r);
        continue;
      }
      // Prefer most-recent updated record when multiple rows exist for same release group
      const existingTs = existing.updatedAt
        ? new Date(existing.updatedAt).getTime()
        : 0;
      const candidateTs = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
      if (candidateTs > existingTs) map.set(r.releaseGroupMbid, r);
    }
    return map;
  }, [query.data]);

  return {
    ...query,
    byReleaseGroup,
  };
}
