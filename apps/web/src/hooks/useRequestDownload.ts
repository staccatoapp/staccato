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
