import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/app/BottomNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_EMAIL, getLocalUserMeta, isLocalMode, supabase, initializePageLocksForNewUser } from "@/integrations/supabase/client";
import { NAV_PAGES, pageLockKey } from "@/lib/page-locks";

function normalizePageLocks(value: unknown): Record<string, boolean> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, boolean>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, boolean>;
    } catch {
      return {};
    }
  }
  return {};
}

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locationSearch = useRouterState({ select: (s) => s.location.search });
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [userPageLocks, setUserPageLocks] = useState<Record<string, boolean>>({});

  const currentPageKey = (() => {
    if (!pathname) return "";
    let tab: string | null = null;
    if (typeof locationSearch === "string") {
      tab = new URLSearchParams(locationSearch.replace(/^\?/, "")).get("tab");
    } else if (locationSearch && typeof locationSearch === "object" && "tab" in locationSearch) {
      tab = String((locationSearch as Record<string, unknown>).tab ?? "");
    }
    const key = tab ? `${pathname}?tab=${tab}` : pathname;
    console.log('[AuthenticatedLayout] Current page key:', key, { pathname, tab });
    return key;
  })();
  const currentPageLocked = currentPageKey ? !!userPageLocks[currentPageKey] : false;

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const loadLocks = async () => {
      if (!user) {
        setUserPageLocks({});
        return;
      }

      if (isLocalMode()) {
        initializePageLocksForNewUser(user.email ?? "");
        const locks = normalizePageLocks(getLocalUserMeta(user.email ?? "").page_locks);
        console.log('[AuthenticatedLayout] Loaded page locks from local mode:', locks);
        setUserPageLocks(locks);
        return;
      }

      try {
        const { data, error } = await supabase.from("users").select("page_locks").eq("id", user.id).single();
        if (!error && data) {
          const locks = normalizePageLocks(data.page_locks);
          console.log('[AuthenticatedLayout] Loaded page locks from Supabase:', locks);
          setUserPageLocks(locks);
        } else {
          console.log('[AuthenticatedLayout] Failed to load page locks:', error);
          setUserPageLocks({});
        }
      } catch (err) {
        console.log('[AuthenticatedLayout] Exception loading page locks:', err);
        setUserPageLocks({});
      }
    };

    loadLocks();
    const handleChange = () => loadLocks();
    const handleStorage = (event: StorageEvent) => {
      // Listen for both old and new event key names for backwards compatibility
      if (event.key === 'kili-local-user-page-locks-refresh' || event.key === 'kili-local-user-meta-refresh') {
        loadLocks();
      }
    };

    window.addEventListener("user-page-lock-change", handleChange);
    window.addEventListener("kili-local-user-meta-updated", handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("user-page-lock-change", handleChange);
      window.removeEventListener("kili-local-user-meta-updated", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [user]);

  // Do not redirect locked pages. Show a locked page message instead.

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin && currentPageLocked) {
    console.log('[AuthenticatedLayout] Page is locked', { currentPageKey, userPageLocks, isAdmin });
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center pb-20">
        <div className="rounded-3xl border border-border bg-card p-10 shadow-xl" style={{ maxWidth: 560 }}>
          <div className="mb-4 text-sm uppercase tracking-[0.24em] text-muted-foreground">Access blocked</div>
          <h1 className="text-3xl font-semibold">Page locked</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This page is currently locked. Subscribe to unlock access and continue using the bot tools.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate({ to: "/eabottest" })} variant="secondary">
              Subscribe for access
            </Button>
            <Button onClick={() => {
              const firstOpen = NAV_PAGES.find((page) => !userPageLocks[pageLockKey(page)]);
              const target = firstOpen?.path ?? "/profile";
              navigate({ to: target });
            }} variant="outline">
              Go to available page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <BottomNav userPageLocks={userPageLocks} />
    </div>
  );
}
