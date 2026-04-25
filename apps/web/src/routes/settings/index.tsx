import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserSettings } from "@staccato/shared";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    userName?: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async (): Promise<UserSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (listenbrainzToken: string | null) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listenbrainzToken }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json() as Promise<UserSettings>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      setTokenInput(null);
      setValidateResult(null);
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch("/api/settings/validate-listenbrainz-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Validation request failed");
      return res.json() as Promise<{ valid: boolean; userName?: string }>;
    },
    onSuccess: (result) => setValidateResult(result),
  });

  const savedToken = data?.listenbrainzToken ?? null;
  const currentInput = tokenInput !== null ? tokenInput : (savedToken ?? "");
  const isDirty = tokenInput !== null && tokenInput !== (savedToken ?? "");

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            ListenBrainz
          </h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="lb-token" className="text-sm font-medium">
                User token
              </label>
              <Input
                id="lb-token"
                type="password"
                placeholder="Paste your ListenBrainz token"
                value={currentInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setValidateResult(null);
                }}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Find your token at{" "}
                <span className="font-mono">listenbrainz.org/profile/</span>
              </p>
            </div>

            {validateResult && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  validateResult.valid ? "text-green-600" : "text-destructive"
                }`}
              >
                {validateResult.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Connected as{" "}
                    <span className="font-medium">
                      {validateResult.userName}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Invalid token
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => validateMutation.mutate(currentInput)}
                disabled={!currentInput || validateMutation.isPending}
              >
                Test connection
              </Button>
              <Button
                onClick={() => saveMutation.mutate(currentInput || null)}
                disabled={!isDirty || saveMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
