import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useValidateLBToken,
  useSaveLBToken,
} from "@/hooks/use-listenbrainz-token";
import { useRef, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  LidarrOptions,
  LidarrSettings,
  LidarrTestResult,
  ResolutionProgress,
  ScanProgress,
  TestLidarrConnection,
  UpdateLidarrSettings,
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

function LidarrSection() {
  const queryClient = useQueryClient();
  const [urlInput, setUrlInput] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<LidarrTestResult | null>(null);
  const [selectedQualityId, setSelectedQualityId] = useState<number | null>(
    null,
  );
  const [selectedMetadataId, setSelectedMetadataId] = useState<number | null>(
    null,
  );
  const [selectedRootFolder, setSelectedRootFolder] = useState<string | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["lidarr-settings"],
    queryFn: async (): Promise<LidarrSettings> => {
      const res = await fetch("/api/settings/lidarr");
      if (!res.ok) throw new Error("Failed to fetch Lidarr settings");
      return res.json();
    },
  });

  const savedUrl = data?.url ?? "";
  const apiKeySet = data?.apiKeySet ?? false;
  const currentUrl = urlInput !== null ? urlInput : savedUrl;
  const keyPlaceholder = apiKeySet ? "•••••• (saved)" : "Lidarr API key";
  const currentKey = keyInput ?? "";

  const urlDirty = urlInput !== null && urlInput !== savedUrl;
  const keyDirty = keyInput !== null && keyInput.length > 0;
  const credsDirty = urlDirty || keyDirty;

  const optionsQuery = useQuery({
    queryKey: ["lidarr-options"],
    queryFn: async (): Promise<LidarrOptions> => {
      const res = await fetch("/api/settings/lidarr/options");
      if (!res.ok) throw new Error("Failed to fetch Lidarr options");
      return res.json();
    },
    enabled: apiKeySet && !!savedUrl,
    staleTime: 5 * 60_000,
  });

  const effectiveOptions: LidarrOptions | null =
    testResult?.connected && testResult.options
      ? testResult.options
      : (optionsQuery.data ?? null);

  useEffect(() => {
    if (!data) return;
    if (selectedQualityId === null && data.qualityProfileId !== null) {
      setSelectedQualityId(data.qualityProfileId);
    }
    if (selectedMetadataId === null && data.metadataProfileId !== null) {
      setSelectedMetadataId(data.metadataProfileId);
    }
    if (selectedRootFolder === null && data.rootFolderPath !== null) {
      setSelectedRootFolder(data.rootFolderPath);
    }
  }, [data, selectedQualityId, selectedMetadataId, selectedRootFolder]);

  useEffect(() => {
    if (!effectiveOptions) return;
    if (selectedQualityId === null && effectiveOptions.qualityProfiles[0]) {
      setSelectedQualityId(effectiveOptions.qualityProfiles[0].id);
    }
    if (selectedMetadataId === null && effectiveOptions.metadataProfiles[0]) {
      setSelectedMetadataId(effectiveOptions.metadataProfiles[0].id);
    }
    if (selectedRootFolder === null && effectiveOptions.rootFolders[0]) {
      setSelectedRootFolder(effectiveOptions.rootFolders[0].path);
    }
  }, [
    effectiveOptions,
    selectedQualityId,
    selectedMetadataId,
    selectedRootFolder,
  ]);

  const selectionsDiffer =
    (data?.qualityProfileId ?? null) !== selectedQualityId ||
    (data?.metadataProfileId ?? null) !== selectedMetadataId ||
    (data?.rootFolderPath ?? null) !== selectedRootFolder;

  const credsAvailable = !credsDirty || testResult?.connected === true;
  const haveSelections =
    selectedQualityId !== null &&
    selectedMetadataId !== null &&
    selectedRootFolder !== null;

  const canSave =
    haveSelections && credsAvailable && (credsDirty || selectionsDiffer);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateLidarrSettings = {};
      if (urlDirty) body.url = urlInput!.trim() || null;
      if (keyDirty) body.apiKey = keyInput!.trim() || null;
      body.qualityProfileId = selectedQualityId;
      body.metadataProfileId = selectedMetadataId;
      body.rootFolderPath = selectedRootFolder;
      const res = await fetch("/api/settings/lidarr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save Lidarr settings");
      }
    },
    onSuccess: () => {
      setUrlInput(null);
      setKeyInput(null);
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ["lidarr-settings"] });
      queryClient.invalidateQueries({ queryKey: ["lidarr-options"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (): Promise<LidarrTestResult> => {
      const body: TestLidarrConnection = {
        url: (urlInput ?? savedUrl).trim(),
        apiKey: (keyInput ?? "").trim(),
      };
      const res = await fetch("/api/settings/lidarr/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Test failed");
      return res.json();
    },
    onSuccess: (result) => {
      setTestResult(result);
      if (result.connected && result.options) {
        setSelectedQualityId(result.options.qualityProfiles[0]?.id ?? null);
        setSelectedMetadataId(result.options.metadataProfiles[0]?.id ?? null);
        setSelectedRootFolder(result.options.rootFolders[0]?.path ?? null);
      }
    },
  });

  const testEnabled =
    !testMutation.isPending &&
    !!(urlInput ?? savedUrl).trim() &&
    !!(keyInput ?? "").trim();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="lidarr-url" className="text-sm font-medium">
          Lidarr URL
        </label>
        <Input
          id="lidarr-url"
          type="text"
          placeholder="http://localhost:8686"
          value={currentUrl}
          onChange={(e) => {
            setUrlInput(e.target.value);
            setTestResult(null);
          }}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="lidarr-key" className="text-sm font-medium">
          API key
        </label>
        <Input
          id="lidarr-key"
          type="password"
          placeholder={keyPlaceholder}
          value={currentKey}
          onChange={(e) => {
            setKeyInput(e.target.value);
            setTestResult(null);
          }}
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Find your API key under Settings → General in your Lidarr instance.
          {credsDirty && " Test the connection before saving."}
        </p>
      </div>

      {testResult && (
        <div
          className={`flex items-center gap-2 text-sm ${
            testResult.connected ? "text-green-500" : "text-destructive"
          }`}
        >
          {testResult.connected ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Connected
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              Could not connect
            </>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={!testEnabled}
        >
          Test connection
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
        >
          Save
        </Button>
      </div>

      {effectiveOptions && (
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quality profile</label>
            <Select
              value={
                selectedQualityId !== null ? String(selectedQualityId) : ""
              }
              onValueChange={(v) => setSelectedQualityId(v ? Number(v) : null)}
              items={effectiveOptions.qualityProfiles.map((p) => ({
                value: String(p.id),
                label: p.name,
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {effectiveOptions.qualityProfiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Metadata profile</label>
            <Select
              value={
                selectedMetadataId !== null ? String(selectedMetadataId) : ""
              }
              onValueChange={(v) => setSelectedMetadataId(v ? Number(v) : null)}
              items={effectiveOptions.metadataProfiles.map((p) => ({
                value: String(p.id),
                label: p.name,
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {effectiveOptions.metadataProfiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Root folder</label>
            <Select
              value={selectedRootFolder ?? ""}
              onValueChange={(v) => setSelectedRootFolder(v || null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {effectiveOptions.rootFolders.map((r) => (
                  <SelectItem key={r.path} value={r.path}>
                    {r.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

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
      return res.json();
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

      <section className="space-y-4 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Lidarr
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect a Lidarr instance to request downloads for songs that
          aren&apos;t in your library yet.
        </p>
        <LidarrSection />
      </section>
    </div>
  );
}
