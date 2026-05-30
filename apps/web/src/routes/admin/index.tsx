import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
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
import { currentUserQueryOptions } from "@/hooks/useCurrentUser";
import { AddUserDialog } from "@/components/admin/AddUserDialog";
import { z } from "zod";
import {
  type AdminUserResponse,
  AdminUserArraySchema,
  type LidarrOptions,
  LidarrOptionsSchema,
  type LidarrSettings,
  LidarrSettingsSchema,
  type LidarrTestResult,
  LidarrTestResultSchema,
  type ScanProgress,
  ScanProgressSchema,
  type TestLidarrConnection,
  type UpdateLidarrSettings,
} from "@staccato/shared";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async ({ context }) => {
    try {
      const user = await context.queryClient.ensureQueryData(
        currentUserQueryOptions,
      );
      if (!user.isAdmin) throw redirect({ to: "/library" });
    } catch (err) {
      if (isRedirect(err)) throw err;
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AdminPage,
});

// ── Category definitions ──────────────────────────────────────────────────

type CategoryId =
  | "library"
  | "integrations"
  | "users"
  | "localization"
  | "maintenance";

interface Category {
  id: CategoryId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const CATEGORIES: Category[] = [
  { id: "library", label: "Library", Icon: Database },
  { id: "integrations", label: "Integrations", Icon: Server, badge: "3" },
  { id: "users", label: "Users", Icon: Users },
  { id: "localization", label: "Localization", Icon: Globe },
  { id: "maintenance", label: "Maintenance", Icon: HardDrive },
];

// ── Library tab ───────────────────────────────────────────────────────────

function ScanSection() {
  const queryClient = useQueryClient();
  const prevRunningRef = useRef(false);
  const [scanComplete, setScanComplete] = useState(false);

  const { data: scanStatus } = useQuery({
    queryKey: ["scan-status"],
    queryFn: async (): Promise<ScanProgress> => {
      const res = await fetch("/api/admin/scan/status");
      if (!res.ok) throw new Error("Failed to fetch scan status");
      return ScanProgressSchema.parse(await res.json());
    },
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  const scanLoaded = scanStatus != null;
  const scanRunning = scanStatus?.running ?? false;
  useEffect(() => {
    if (prevRunningRef.current && scanLoaded && !scanRunning) {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
      queryClient.invalidateQueries({ queryKey: ["album"] });
      setScanComplete(true);
      const t = setTimeout(() => setScanComplete(false), 3000);
      return () => clearTimeout(t);
    }
    prevRunningRef.current = scanRunning;
  }, [scanLoaded, scanRunning, queryClient]);

  const { mutate: triggerScan, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/scan", { method: "POST" });
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
      ? Math.round((scanStatus.resolved / scanStatus.total) * 100)
      : 0;

  if (isRunning) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Scanning &amp; resolving…</span>
          <span>
            {scanStatus?.resolved ?? 0} / {scanStatus?.total ?? "?"}
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
        Scan library
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

function LibraryTab() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Scan your library to pick up new files and remove deleted ones.
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
          <span>
            <span className="tabular-nums text-foreground">—</span> tracks
          </span>
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>
          <span className="tabular-nums text-foreground">—</span> albums
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>
          <span className="tabular-nums text-foreground">—</span> artists
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-foreground">—</span>
      </div>
      <ScanSection />
    </div>
  );
}

// ── Integrations tab ──────────────────────────────────────────────────────

interface IntegrationCardProps {
  name: string;
  status: string;
  statusKind: "ok" | "err" | "muted";
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

function IntegrationCard({
  name,
  status,
  statusKind,
  description,
  expanded,
  onToggle,
  children,
}: IntegrationCardProps) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.65rem] font-medium px-1.5 py-0.5 rounded",
                statusKind === "ok" && "text-green-400 bg-green-400/10",
                statusKind === "err" && "text-destructive bg-destructive/10",
                statusKind === "muted" && "text-muted-foreground bg-muted",
              )}
            >
              {statusKind === "ok" && <CheckCircle2 className="w-2.5 h-2.5" />}
              {statusKind === "err" && <XCircle className="w-2.5 h-2.5" />}
              {status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-150",
            expanded && "rotate-180",
          )}
        />
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>
      )}
    </div>
  );
}

function LidarrForm() {
  const queryClient = useQueryClient();
  const [urlInput, setUrlInput] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState<string | null>(null);
  const [keyEverEdited, setKeyEverEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
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
      const res = await fetch("/api/admin/lidarr");
      if (!res.ok) throw new Error("Failed to fetch Lidarr settings");
      return LidarrSettingsSchema.parse(await res.json());
    },
  });

  const savedUrl = data?.url ?? "";
  const apiKeySet = data?.apiKeySet ?? false;
  const currentUrl = urlInput !== null ? urlInput : savedUrl;
  const keyPlaceholder = apiKeySet ? "•••••• (saved)" : "Lidarr API key";
  const currentKey = keyInput ?? "";

  const urlDirty = urlInput !== null && urlInput !== savedUrl;
  const keyDirty = keyInput !== null && keyInput.length > 0;
  const credsDirty = urlDirty || keyDirty || keyEverEdited;

  const optionsQuery = useQuery({
    queryKey: ["lidarr-options"],
    queryFn: async (): Promise<LidarrOptions> => {
      const res = await fetch("/api/admin/lidarr/options");
      if (!res.ok) throw new Error("Failed to fetch Lidarr options");
      return LidarrOptionsSchema.parse(await res.json());
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
      if (urlDirty) {
        const trimmedUrl = urlInput!.trim();
        if (!trimmedUrl) throw new Error("URL cannot be empty");
        body.url = trimmedUrl;
      }
      if (keyDirty) body.apiKey = keyInput!.trim() || null;
      body.qualityProfileId = selectedQualityId;
      body.metadataProfileId = selectedMetadataId;
      body.rootFolderPath = selectedRootFolder;
      const res = await fetch("/api/admin/lidarr", {
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
      setKeyEverEdited(false);
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ["lidarr-settings"] });
      queryClient.invalidateQueries({ queryKey: ["lidarr-options"] });
      queryClient.invalidateQueries({ queryKey: ["lidarr-connectivity"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (): Promise<LidarrTestResult> => {
      const body: TestLidarrConnection = {
        url: (urlInput ?? savedUrl).trim(),
        apiKey: (keyInput ?? "").trim(),
      };
      const res = await fetch("/api/admin/lidarr/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Test failed");
      return LidarrTestResultSchema.parse(await res.json());
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
    <div className="space-y-4 mt-4">
      <div className="space-y-1.5">
        <label htmlFor="admin-lidarr-url" className="text-sm font-medium">
          Lidarr URL
        </label>
        <Input
          id="admin-lidarr-url"
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
        <label htmlFor="admin-lidarr-key" className="text-sm font-medium">
          API key
        </label>
        <div className="relative">
          <Input
            id="admin-lidarr-key"
            type={showKey ? "text" : "password"}
            placeholder={keyPlaceholder}
            value={currentKey}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setKeyEverEdited(true);
              setTestResult(null);
            }}
            disabled={isLoading}
            className="pr-10"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Find your API key under Settings → General in your Lidarr instance.
          {credsDirty && " Test the connection before saving."}
        </p>
      </div>

      {testResult && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm",
            testResult.connected ? "text-green-500" : "text-destructive",
          )}
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

function IntegrationsTab() {
  const [openCard, setOpenCard] = useState<string | null>("lidarr");

  const { data: lidarrSettings } = useQuery({
    queryKey: ["lidarr-settings"],
    queryFn: async (): Promise<LidarrSettings> => {
      const res = await fetch("/api/admin/lidarr");
      if (!res.ok) throw new Error("Failed to fetch Lidarr settings");
      return LidarrSettingsSchema.parse(await res.json());
    },
  });

  const lidarrConfigured = lidarrSettings?.apiKeySet && !!lidarrSettings?.url;

  const connectivityQuery = useQuery({
    queryKey: ["lidarr-connectivity"],
    queryFn: async (): Promise<{ connected: boolean }> => {
      const res = await fetch("/api/admin/lidarr/connectivity");
      if (!res.ok) throw new Error("Connectivity check failed");
      return z.object({ connected: z.boolean() }).parse(await res.json());
    },
    enabled: lidarrConfigured,
    staleTime: Infinity,
    retry: false,
  });

  const lidarrStatus: { label: string; kind: "ok" | "err" | "muted" } =
    !lidarrConfigured
      ? { label: "Not configured", kind: "muted" }
      : connectivityQuery.isFetching || connectivityQuery.isPending
        ? { label: "Testing...", kind: "muted" }
        : connectivityQuery.isError ||
            connectivityQuery.data?.connected === false
          ? { label: "Failed", kind: "err" }
          : { label: "Connected", kind: "ok" };

  const toggle = (id: string) =>
    setOpenCard((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-2.5">
      <IntegrationCard
        name="Lidarr"
        status={lidarrStatus.label}
        statusKind={lidarrStatus.kind}
        description="Request downloads for songs not yet in your library."
        expanded={openCard === "lidarr"}
        onToggle={() => toggle("lidarr")}
      >
        <LidarrForm />
      </IntegrationCard>

      <IntegrationCard
        name="AcoustID"
        status="Coming soon"
        statusKind="muted"
        description="Fingerprint untagged tracks to fetch missing metadata."
        expanded={openCard === "acoustid"}
        onToggle={() => toggle("acoustid")}
      >
        <div className="space-y-4 mt-4 opacity-50 pointer-events-none">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">API key</label>
            <Input
              type="password"
              placeholder="Paste your AcoustID API key"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Get a free API key at{" "}
              <span className="font-mono">acoustid.org/api-key</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              Test connection
            </Button>
            <Button disabled>Save</Button>
          </div>
        </div>
      </IntegrationCard>

      <IntegrationCard
        name="MusicBrainz"
        status="Connected"
        statusKind="ok"
        description="Canonical artist, album, and release metadata. No key required."
        expanded={openCard === "musicbrainz"}
        onToggle={() => toggle("musicbrainz")}
      >
        <p className="text-sm text-muted-foreground mt-3">
          MusicBrainz is enabled by default and used by every metadata resolve.
          No configuration needed.
        </p>
      </IntegrationCard>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const [addUserOpen, setAddUserOpen] = useState(false);

  const {
    data: users,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async (): Promise<AdminUserResponse[]> => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return AdminUserArraySchema.parse(await res.json());
    },
  });

  const userCount = users?.length ?? 0;
  const adminCount = users?.filter((u) => u.isAdmin).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button className="gap-2" onClick={() => setAddUserOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add user
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {userCount} {userCount === 1 ? "user" : "users"} · {adminCount} admin
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load users.</p>
      ) : !users?.length ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3.5 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground bg-muted/30">
                  Username
                </th>
                <th className="px-3.5 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground bg-muted/30">
                  Role
                </th>
                <th className="px-3.5 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground bg-muted/30">
                  Last seen
                </th>
                <th className="px-3.5 py-3 bg-muted/30 w-10" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="hover:bg-accent/30 transition-colors">
                  <td
                    className={cn(
                      "px-3.5 py-3",
                      i < users.length - 1 && "border-b border-border",
                    )}
                  >
                    <div className="font-medium text-foreground">
                      {u.username}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3.5 py-3",
                      i < users.length - 1 && "border-b border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[0.7rem] font-medium px-2 py-0.5 rounded capitalize",
                        u.isAdmin
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground bg-muted",
                      )}
                    >
                      {u.isAdmin && <ShieldCheck className="w-2.5 h-2.5" />}
                      {u.isAdmin ? "admin" : "user"}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3.5 py-3 text-muted-foreground",
                      i < users.length - 1 && "border-b border-border",
                    )}
                  >
                    {"—"}
                  </td>
                  <td
                    className={cn(
                      "px-3.5 py-3",
                      i < users.length - 1 && "border-b border-border",
                    )}
                  >
                    <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ["admin-users"] })
        }
      />
    </div>
  );
}

// ── Localization tab ──────────────────────────────────────────────────────

function LocalizationTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Defaults applied to new users. Each user can override these in their
        personal settings.
      </p>
      <div className="space-y-5 opacity-50 pointer-events-none">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Default language</label>
          <Select defaultValue="en" disabled>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="es">Español</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Region</label>
          <Select defaultValue="us" disabled>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">United States</SelectItem>
              <SelectItem value="uk">United Kingdom</SelectItem>
              <SelectItem value="de">Germany</SelectItem>
              <SelectItem value="jp">Japan</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Affects regional release dates and chart sources.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Date format</label>
          <Select defaultValue="auto" disabled>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Match region</SelectItem>
              <SelectItem value="iso">2026-05-27</SelectItem>
              <SelectItem value="us">5/27/2026</SelectItem>
              <SelectItem value="eu">27/05/2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ── Maintenance tab ───────────────────────────────────────────────────────

function MaintenanceTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Backup, restore, and server-level operations.
      </p>

      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <span>
          Version <span className="tabular-nums text-foreground">—</span>
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>
          Uptime <span className="text-foreground">—</span>
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span>
          DB size <span className="tabular-nums text-foreground">—</span>
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
          Logs
        </p>
        <Button
          variant="outline"
          disabled
          title="Coming soon"
          className="gap-2 opacity-40 cursor-not-allowed"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View server logs
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Danger zone
        </p>
        <p className="text-sm text-muted-foreground">
          Restarting the server briefly drops all active streams.
        </p>
        <Button
          variant="outline"
          disabled
          title="Coming soon"
          className="opacity-40 cursor-not-allowed border-destructive/30 text-destructive hover:text-destructive hover:border-destructive/30"
        >
          Restart server
        </Button>
      </div>
    </div>
  );
}

// ── Admin page ────────────────────────────────────────────────────────────

function AdminPage() {
  const [activeTab, setActiveTab] = useState<CategoryId>("library");
  const activeCategory =
    CATEGORIES.find((c) => c.id === activeTab) ?? CATEGORIES[0];

  return (
    <div>
      {/* Sticky header with tab strip */}
      <div className="sticky top-0 z-10 bg-background px-9 pt-6 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Admin settings</h1>
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" />
            Admin
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Server-wide configuration. Changes here apply to every user on this
          instance.
        </p>

        <nav
          className="flex gap-0.5 overflow-x-auto -mb-px"
          role="tablist"
          aria-label="Admin categories"
        >
          {CATEGORIES.map((cat) => {
            const active = cat.id === activeTab;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(cat.id)}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2.5 text-[0.825rem] font-medium whitespace-nowrap border-b-2 transition-colors duration-150 focus-visible:outline-none",
                  active
                    ? "text-foreground border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                <cat.Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{cat.label}</span>
                {cat.badge && (
                  <span
                    className={cn(
                      "text-[0.65rem] tabular-nums px-1.5 py-0.5 rounded",
                      active
                        ? "text-foreground bg-foreground/10"
                        : "text-muted-foreground bg-muted",
                    )}
                  >
                    {cat.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="px-9 py-7 pb-24">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight mb-5">
            {activeCategory?.label}
          </h2>
          {activeTab === "library" && <LibraryTab />}
          {activeTab === "integrations" && <IntegrationsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "localization" && <LocalizationTab />}
          {activeTab === "maintenance" && <MaintenanceTab />}
        </div>
      </div>
    </div>
  );
}
