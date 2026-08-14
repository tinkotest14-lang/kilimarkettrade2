import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Bot, RefreshCw, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageLockKey } from "@/lib/page-locks";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_EMAIL } from "@/integrations/supabase/client";

const ITEMS = [
  { to: "/charts", label: "Charts", icon: BarChart3 },
  { to: "/eabottest", label: "Overview", icon: RefreshCw },
  { to: "/eabottest", search: { tab: "botting" }, label: "Bot Trading", icon: Bot },
  { to: "/eabottest", search: { tab: "tools" }, label: "Tools", icon: Wrench },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav({ userPageLocks }: { userPageLocks: Record<string, boolean> }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locationSearch = useRouterState({ select: (s) => s.location.search });
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const activeTab = (() => {
    if (typeof locationSearch === "string") {
      return new URLSearchParams(locationSearch.replace(/^\?/, "")).get("tab");
    }
    if (locationSearch && typeof locationSearch === "object" && "tab" in locationSearch) {
      return String((locationSearch as Record<string, unknown>).tab ?? "");
    }
    return null;
  })();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-3xl">
        {ITEMS.filter((item) => isAdmin || !userPageLocks[pageLockKey(item)]).map(({ to, search, label, icon: Icon }) => {
          const active = search ? pathname.startsWith(to) && activeTab === search.tab : pathname.startsWith(to) && !activeTab;
          const key = `${to}-${search?.tab ?? "default"}-${label}`;
          return (
            <li key={key} className="flex-1">
              <Link
                to={to}
                search={search}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 py-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />}
                <Icon className={cn("size-5", active && "text-primary")} strokeWidth={active ? 2.4 : 1.8} />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
