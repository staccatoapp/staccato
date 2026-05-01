import { useMutation, useQueryClient } from "@tanstack/react-query";

// TODO - validate and save are always used together, refactor
export function useValidateLBToken() {
  return useMutation({
    mutationFn: async (
      token: string,
    ): Promise<{ valid: boolean; userName?: string }> => {
      const res = await fetch("/api/settings/validate-listenbrainz-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Validation request failed");
      return res.json();
    },
  });
}

export function useSaveLBToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string | null) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listenbrainzToken: token }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}
