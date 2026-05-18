import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateDownloadRequest, DownloadRequest } from "@staccato/shared";

export function useRequestDownload() {
  const queryClient = useQueryClient();

  return useMutation<DownloadRequest, Error, CreateDownloadRequest>({
    mutationFn: async (body) => {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Download request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}

export function useRetryDownload() {
  const queryClient = useQueryClient();

  return useMutation<
    DownloadRequest,
    Error,
    { requestId: string; payload: CreateDownloadRequest }
  >({
    mutationFn: async ({ requestId, payload }) => {
      const del = await fetch(`/api/downloads/${requestId}`, {
        method: "DELETE",
      });
      if (!del.ok && del.status !== 404) {
        throw new Error(`Failed to delete failed request (${del.status})`);
      }
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Retry failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}
