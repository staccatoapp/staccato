import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserSettings } from "@staccato/shared";

const DEFAULT_VOLUME = 80;

export function useVolume() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async (): Promise<UserSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (volume: number) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume }),
      });
      if (!res.ok) throw new Error("Failed to save volume");
    },
    onMutate: async (volume) => {
      await queryClient.cancelQueries({ queryKey: ["user-settings"] });
      const prev = queryClient.getQueryData<UserSettings>(["user-settings"]);
      queryClient.setQueryData<UserSettings>(["user-settings"], (old) =>
        old ? { ...old, volume } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev)
        queryClient.setQueryData(["user-settings"], context.prev);
    },
  });

  return {
    volume: data?.volume ?? DEFAULT_VOLUME,
    setVolume: (v: number) => mutation.mutate(v),
  };
}
