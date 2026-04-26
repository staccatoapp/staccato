import { useState } from "react";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  Compass,
  Disc3,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybackSession } from "@staccato/shared";
import { PlayerBar } from "@/components/layout/player-bar";

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
  { to: "/explore" as const, label: "Explore", icon: Compass },
  { to: "/settings" as const, label: "Settings", icon: Settings },
] as const;

function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", String(!c));
      return !c;
    });
  };

  return (
    <aside
      style={{
        width: collapsed ? "3.5rem" : "14rem",
        minWidth: collapsed ? "3.5rem" : "14rem",
      }}
      className="flex flex-col shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 overflow-hidden transition-[width,min-width] duration-200 ease-in-out"
    >
      <div
        className={cn(
          "flex items-center py-3 px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Disc3 className="w-5 h-5 text-primary shrink-0" />
            <span className="font-bold tracking-tight whitespace-nowrap">
              Staccato
            </span>
          </div>
        )}
        {collapsed && <Disc3 className="w-5 h-5 text-primary" />}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md shrink-0",
            collapsed && "absolute right-1 top-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            title={collapsed ? label : undefined}
            activeProps={{ className: "bg-accent text-foreground" }}
            className={cn(
              "flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function LayoutContent() {
  const { data: hasQueue } = useQuery({
    queryKey: ["playback-session"],
    queryFn: async (): Promise<PlaybackSession> => {
      const res = await fetch("/api/playback/session");
      if (!res.ok) throw new Error("Failed to fetch playback session");
      const json = await res.json();
      return json;
    },
    select: (d) => (d?.trackQueue?.length ?? 0) > 0,
  });

  return (
    <>
      <div className="flex h-screen">
        <Sidebar />
        <main className={cn("flex-1 overflow-y-auto", hasQueue && "pb-20")}>
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <TanStackRouterDevtools position="top-right" />
    </>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutContent />
    </QueryClientProvider>
  );
}
