import { useRef, useEffect } from "react";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Disc3, Library, ListMusic, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ScanProgress } from "@staccato/shared";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (
    <div className="p-6">
      <p className="text-muted-foreground text-sm">Page not found.</p>
      <Link
        to="/library"
        className="text-sm text-primary underline mt-2 inline-block"
      >
        Go to Library
      </Link>
    </div>
  ),
});

const NAV_ITEMS = [
  { to: "/library" as const, label: "Library", icon: Library },
] as const;

// TODO - implement at some point way later
const DISABLED_NAV_ITEMS = [
  { label: "Playlists", icon: ListMusic },
  { label: "Settings", icon: Settings },
];

function ScanSection() {
  const queryClient = useQueryClient();
  const prevRunningRef = useRef(false);

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
    },
  });

  const isRunning = scanStatus?.running ?? false;
  const percent =
    scanStatus?.total && scanStatus.total > 0
      ? Math.round((scanStatus.scanned / scanStatus.total) * 100)
      : 0;

  if (isRunning) {
    return (
      <div className="space-y-2 px-1">
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
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      onClick={() => triggerScan()}
      disabled={isPending}
    >
      <RefreshCw className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
      Scan Library
    </Button>
  );
}

function Sidebar() {
  return (
    <aside className="flex flex-col w-56 shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 p-3 gap-2">
      <div className="flex items-center gap-2 px-3 py-2">
        <Disc3 className="w-5 h-5 text-primary" />
        <span className="font-bold tracking-tight">Staccato</span>
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            activeProps={{ className: "bg-accent text-foreground" }}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
        {DISABLED_NAV_ITEMS.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/40 cursor-not-allowed select-none"
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </div>
        ))}
      </nav>

      <div className="border-t border-border pt-3">
        <ScanSection />
      </div>
    </aside>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </QueryClientProvider>
  );
}
