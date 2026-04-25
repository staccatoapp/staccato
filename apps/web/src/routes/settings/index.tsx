import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  ResolutionProgress,
  ScanProgress,
  UserSettings,
} from "@staccato/shared";

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
});

function ScanSection() {
  const queryClient = useQueryClient();
  const prevRunningRef = useRef(false);
  const [scanComplete, setScanComplete] = useState(false);

  const { data: scanStatus } = useQuery({
    queryKey: ["scan-status"],
    queryFn: async (): Promise<ScanProgress> => {
      const res = await fetch("/api/library/scan/status");
      if (!res.ok) throw new Error("Failed to fetch scan status");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  useEffect(() => {
    if (prevRunningRef.current && scanStatus && !scanStatus.running) {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
      queryClient.invalidateQueries({ queryKey: ["album"] });
      setScanComplete(true);
      const t = setTimeout(() => setScanComplete(false), 3000);
      return () => clearTimeout(t);
    }
    prevRunningRef.current = scanStatus?.running ?? false;
  }, [scanStatus?.running, queryClient]);

  const { mutate: triggerScan, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/library/scan", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to start scan");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-status"] });
      setScanComplete(false);
    },
  });

  const isRunning = scanStatus?.running ?? false;
  const percent =
    scanStatus?.total && scanStatus.total > 0
      ? Math.round((scanStatus.scanned / scanStatus.total) * 100)
      : 0;

  if (isRunning) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Scanning…</span>
          <span>
            {scanStatus?.scanned ?? 0} / {scanStatus?.total ?? "?"}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => triggerScan()}
        disabled={isPending}
      >
        <RefreshCw className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
        Scan Library
      </Button>
      {scanComplete && (
        <span className="flex items-center gap-1.5 text-sm text-green-500">
          <CheckCircle2 className="w-4 h-4" />
          Scan complete
        </span>
      )}
    </div>
  );
}

function ResolveSection() {
  const queryClient = useQueryClient();
  const prevRunningRef = useRef(false);
  const [resolveComplete, setResolveComplete] = useState(false);

  const { data: scanStatus } = useQuery({
    queryKey: ["scan-status"],
    queryFn: async (): Promise<ScanProgress> => {
      const res = await fetch("/api/library/scan/status");
      if (!res.ok) throw new Error("Failed to fetch scan status");
      return res.json();
    },
    refetchInterval: false,
  });

  const { data: resolveStatus } = useQuery({
    queryKey: ["resolve-status"],
    queryFn: async (): Promise<ResolutionProgress> => {
      const res = await fetch("/api/library/resolve/status");
      if (!res.ok) throw new Error("Failed to fetch resolve status");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  useEffect(() => {
    if (prevRunningRef.current && resolveStatus && !resolveStatus.running) {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["album"] });
      setResolveComplete(true);
      const t = setTimeout(() => setResolveComplete(false), 3000);
      return () => clearTimeout(t);
    }
    prevRunningRef.current = resolveStatus?.running ?? false;
  }, [resolveStatus?.running, queryClient]);

  const { mutate: triggerResolve, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/library/resolve", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to start resolution");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resolve-status"] });
      setResolveComplete(false);
    },
  });

  if (scanStatus?.running) return null;

  const isRunning = resolveStatus?.running ?? false;
  const percent =
    resolveStatus?.total && resolveStatus.total > 0
      ? Math.round((resolveStatus.resolved / resolveStatus.total) * 100)
      : 0;

  if (isRunning) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Resolving metadata…</span>
          <span>
            {resolveStatus?.resolved ?? 0} / {resolveStatus?.total ?? "?"}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => triggerResolve()}
        disabled={isPending}
      >
        <Sparkles className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
        Resolve Metadata
      </Button>
      {resolveComplete && (
        <span className="flex items-center gap-1.5 text-sm text-green-500">
          <CheckCircle2 className="w-4 h-4" />
          Resolution complete
        </span>
      )}
    </div>
  );
}

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

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Library
        </h2>
        <p className="text-sm text-muted-foreground">
          Scan your library to pick up new files and remove deleted ones.
        </p>
        <ScanSection />
        <ResolveSection />
      </section>

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
      </section>
    </div>
  );
}
