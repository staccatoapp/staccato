import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  useValidateLBToken,
  useSaveLBToken,
} from "@/hooks/use-listenbrainz-token";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type UserSettings, UserSettingsSchema } from "@staccato/shared";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
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
      return UserSettingsSchema.parse(await res.json());
    },
  });

  const saveMutation = useSaveLBToken();
  const validateMutation = useValidateLBToken();

  const savedToken = data?.listenbrainzToken ?? null;
  const currentInput = tokenInput !== null ? tokenInput : (savedToken ?? "");
  const isDirty = tokenInput !== null && tokenInput !== (savedToken ?? "");

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
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
                validateResult.valid ? "text-green-500" : "text-destructive"
              }`}
            >
              {validateResult.valid ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Connected as{" "}
                  <span className="font-medium">{validateResult.userName}</span>
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
              onClick={() =>
                validateMutation.mutate(currentInput, {
                  onSuccess: setValidateResult,
                })
              }
              disabled={!currentInput || validateMutation.isPending}
            >
              Test connection
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate(currentInput || null, {
                  onSuccess: () => {
                    setTokenInput(null);
                    setValidateResult(null);
                  },
                })
              }
              disabled={!isDirty || saveMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
