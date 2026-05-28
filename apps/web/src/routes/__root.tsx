import { useState } from "react";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  isRedirect,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { QueryClient, useQuery } from "@tanstack/react-query";
import {
  Compass,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybackSession } from "@staccato/shared";
import { PlayerBar } from "@/components/layout/player-bar";
import { Toaster } from "@/components/ui/sonner";
import {
  useCurrentUser,
  currentUserQueryOptions,
} from "@/hooks/useCurrentUser";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async ({ context, location }) => {
      try {
        await context.queryClient.ensureQueryData(currentUserQueryOptions);
        if (location.pathname.startsWith("/onboarding")) {
          throw redirect({ to: "/library" });
        }
      } catch (err) {
        if (isRedirect(err)) throw err;
        if (!location.pathname.startsWith("/onboarding")) {
          throw redirect({ to: "/onboarding" });
        }
      }
    },
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
  },
);

function StaccatoMark({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 64 64"
      fill="currentColor"
      role="img"
      aria-label="Staccato"
      className={className}
    >
      <rect x="7" y="21" width="6" height="22" rx="1.5" />
      <rect x="18" y="15" width="6" height="34" rx="1.5" />
      <rect x="29" y="24" width="6" height="16" rx="1.5" />
      <rect x="40" y="10" width="6" height="44" rx="1.5" />
      <rect x="51" y="20" width="6" height="24" rx="1.5" />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: "/library" as const, label: "Library", icon: Library },
  { to: "/explore" as const, label: "Explore", icon: Compass },
  { to: "/settings" as const, label: "Settings", icon: Settings },
  {
    to: "/admin" as const,
    label: "Admin",
    icon: ShieldCheck,
    isAdmin: true,
  },
] as const;

function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  const { data: currentUser } = useCurrentUser();

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
            <StaccatoMark className="w-5 h-5 text-primary shrink-0" />
            <span className="font-bold tracking-tight whitespace-nowrap">
              Staccato
            </span>
          </div>
        )}
        {collapsed && <StaccatoMark className="w-5 h-5 text-primary" />}
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
        {NAV_ITEMS.filter(
          (item) =>
            !("isAdmin" in item && item.isAdmin) || currentUser?.isAdmin,
        ).map(({ to, label, icon: Icon, ...rest }) => {
          const isAdmin = "isAdmin" in rest && rest.isAdmin;
          return (
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
              <Icon
                className={cn("w-4 h-4 shrink-0", isAdmin && "text-primary")}
              />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Status tile */}
      <div className="border-t border-border pt-3 mt-1 px-2">
        {collapsed ? (
          <div className="flex justify-center py-1">
            <StaccatoMark className="w-4 h-4 text-primary" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-1 py-1">
            <StaccatoMark className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0 flex flex-col leading-tight">
              <span className="text-[0.78rem] font-semibold text-foreground truncate tracking-tight">
                Staccato
              </span>
              <span className="text-[0.68rem] font-medium text-muted-foreground tabular-nums mt-0.5">
                v—
              </span>
            </div>
          </div>
        )}
      </div>
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
  const { location } = useRouterState();
  const isOnboarding = location.pathname.startsWith("/onboarding");
  return (
    <>
      {isOnboarding ? <Outlet /> : <LayoutContent />}
      <Toaster richColors position="bottom-center" />
    </>
  );
}
