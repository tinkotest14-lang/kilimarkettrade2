import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cable } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getLocalUserMeta, writeLocalUserMeta, isLocalMode, isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const EABO_STORAGE_KEY = "eabo-sim-state-v1";

interface EaboPosition {
  symbol: string;
  dir: 1 | -1;
  lots: number;
  entry: number;
}

interface PersistedEaboState {
  balance: number;
  positions: EaboPosition[];
  market: Record<string, { price: number }>;
}

function loadPersistedEaboState(): PersistedEaboState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EABO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEaboState;
  } catch {
    return null;
  }
}

function getEaboSymbolMultiplier(symbol: string) {
  switch (symbol) {
    case "XAUUSD":
      return 100;
    case "BTCUSD":
    case "ETHUSD":
    case "NAS100":
      return 1;
    case "EURUSD":
    case "GBPUSD":
      return 1000;
    case "USDJPY":
      return 100;
    case "XAGUSD":
      return 5000;
    case "WTIUSD":
    case "BRENTUSD":
      return 1000;
    case "NATGASUSD":
      return 10000;
    default:
      return 1;
  }
}

function computeEaboMetrics(state: PersistedEaboState | null) {
  if (!state) return null;
  const positions = state.positions || [];
  const market = state.market || {};

  const unrealizedTotal = positions.reduce((sum, position) => {
    const currentPrice = market[position.symbol]?.price ?? position.entry;
    return sum + (currentPrice - position.entry) * position.dir * position.lots * getEaboSymbolMultiplier(position.symbol);
  }, 0);

  const balance = state.balance ?? 0;
  const equity = balance + unrealizedTotal;
  const usedMargin = positions.reduce((sum, position) => {
    const currentPrice = market[position.symbol]?.price ?? position.entry;
    return sum + (currentPrice * position.lots * getEaboSymbolMultiplier(position.symbol)) / 100;
  }, 0);

  return {
    balance,
    equity,
    usedMargin,
    freeMargin: equity - usedMargin,
    openPositions: positions.length,
  };
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile \u00b7 KiliMarkets" },
      { name: "description", content: "Manage your KiliMarkets account, broker connections and session." },
      { property: "og:title", content: "Profile \u00b7 KiliMarkets" },
      { property: "og:description", content: "Manage your account and broker connections." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mt5Open, setMt5Open] = useState(false);
  const [mt5Pending, setMt5Pending] = useState(false);
  const [mt5Form, setMt5Form] = useState({ login: "", password: "", server: "" });
  const [eaboState, setEaboState] = useState<PersistedEaboState | null>(null);

  const [userMeta, setUserMeta] = useState({ balance: 500, subscribed: false, subscription_status: null, subscription_plan: null, subscription_amount: null, locked: false, mt5_connected: false, mt5_status: null, mt5_details: null, wallet_address: null });

  // Request history state
  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [topupRequests, setTopupRequests] = useState<any[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);

  const refreshUserMeta = () => {
    if (!user) return;
    if (isLocalMode()) {
      setUserMeta(getLocalUserMeta(user.email ?? ""));
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase.from("users").select("balance, subscribed, subscription_status, subscription_plan, subscription_amount, mt5_connected, mt5_status, mt5_details, wallet_address").eq("id", user.id).single();
        if (!error && data) {
          setUserMeta({
            balance: Number(data.balance ?? 10000),
            subscribed: Boolean(data.subscribed),
            subscription_status: data.subscription_status ?? null,
            subscription_plan: data.subscription_plan ?? null,
            subscription_amount: data.subscription_amount ?? null,
            locked: false,
            mt5_connected: Boolean(data.mt5_connected ?? false),
            mt5_status: data.mt5_status ?? null,
            mt5_details: data.mt5_details ?? null,
            wallet_address: data.wallet_address ?? null,
          });
        } else {
          setUserMeta(getLocalUserMeta(user.email ?? ""));
        }
      } catch {
        setUserMeta(getLocalUserMeta(user.email ?? ""));
      }
    })();
  };

  const loadUserRequests = () => {
    if (!user || isLocalMode()) return;

    void (async () => {
      try {
        // Load subscription requests
        const { data: subData } = await supabase
          .from("subscription_requests")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setSubscriptionRequests(subData ?? []);

        // Load topup requests
        const { data: topupData } = await supabase
          .from("topups")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setTopupRequests(topupData ?? []);

        // Load withdrawal requests
        const { data: withdrawData } = await supabase
          .from("withdrawals")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setWithdrawalRequests(withdrawData ?? []);
      } catch (err) {
        console.warn('[Profile] Failed to load requests:', err);
      }
    })();
  };

  useEffect(() => {
    refreshUserMeta();
    loadUserRequests();
    
    // Add real-time listener for subscription updates from admin
    if (!user?.id || isLocalMode()) return;
    
    const subscriptions = [];

    // Listen to user updates
    const userSub = supabase
      .channel(`user:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Profile] User updated:', payload);
          const newData = payload.new as any;
          setUserMeta((prev) => ({
            ...prev,
            balance: Number(newData.balance ?? prev.balance),
            subscribed: Boolean(newData.subscribed ?? prev.subscribed),
            subscription_status: newData.subscription_status ?? prev.subscription_status,
            subscription_plan: newData.subscription_plan ?? prev.subscription_plan,
            subscription_amount: newData.subscription_amount ?? prev.subscription_amount,
            mt5_connected: Boolean(newData.mt5_connected ?? prev.mt5_connected),
            mt5_status: newData.mt5_status ?? prev.mt5_status,
            mt5_details: newData.mt5_details ?? prev.mt5_details,
            wallet_address: newData.wallet_address ?? prev.wallet_address,
          }));
        }
      )
      .subscribe();
    subscriptions.push(userSub);

    // Listen to subscription requests changes
    const subReqSub = supabase
      .channel(`subscription_requests:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_requests',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[Profile] Subscription requests changed');
          loadUserRequests();
        }
      )
      .subscribe();
    subscriptions.push(subReqSub);

    // Listen to topups changes
    const topupSub = supabase
      .channel(`topups:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topups',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[Profile] Topups changed');
          loadUserRequests();
        }
      )
      .subscribe();
    subscriptions.push(topupSub);

    // Listen to withdrawals changes
    const withdrawSub = supabase
      .channel(`withdrawals:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[Profile] Withdrawals changed');
          loadUserRequests();
        }
      )
      .subscribe();
    subscriptions.push(withdrawSub);

    return () => {
      subscriptions.forEach(sub => {
        if (sub) supabase.removeChannel(sub);
      });
    };
  }, [user]);

  async function submitMt5Request() {
    if (!user) return;
    const payload = {
      id: `mt5-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user.id ?? null,
      user_email: user.email ?? null,
      login: mt5Form.login,
      server: mt5Form.server,
      // store provided password (admin will see this in admin UI)
      password: mt5Form.password ?? null,
      status: "pending",
      details: JSON.stringify({ login: mt5Form.login, server: mt5Form.server }),
      created_at: new Date().toISOString(),
    };

    try {
      if (isLocalMode() || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_mt5_requests';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        list.push(payload);
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(list));
        // notify other tabs/listeners
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-mt5-requests-updated'));
        // persist pending status to local user meta so it survives logout/reload
        try {
          if (payload.user_email) {
            writeLocalUserMeta(payload.user_email, { mt5_status: 'pending', mt5_connected: false, mt5_details: { login: payload.login, server: payload.server, password: payload.password ?? null } });
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
              window.dispatchEvent(new Event('kili-local-user-meta-updated'));
            }
          }
        } catch (e) {
          // ignore
        }
        setMt5Pending(true);
        setMt5Open(false);
        return;
      }

      const inserted = await supabase.from('mt5_requests').insert({ user_id: payload.user_id, user_email: payload.user_email, login: payload.login, server: payload.server, status: payload.status, details: payload.details, created_at: payload.created_at });
      if (inserted.error) throw inserted.error;
      // mark pending on the users row so it remains visible across sessions
      try {
        const details = { login: payload.login, server: payload.server, password: payload.password ?? null };
        if (payload.user_id) {
          await supabase.from('users').update({ mt5_status: 'pending', mt5_connected: false, mt5_details: details }).eq('id', payload.user_id);
        } else if (payload.user_email) {
          await supabase.from('users').update({ mt5_status: 'pending', mt5_connected: false, mt5_details: details }).eq('email', payload.user_email);
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
          window.dispatchEvent(new Event('kili-local-user-meta-updated'));
        }
      } catch (e) {
        // ignore
      }

      setMt5Pending(true);
      setMt5Open(false);
    } catch (err: any) {
      // best-effort: surface error to user
      console.warn('Failed to submit MT5 request', err?.message ?? err);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMetaUpdate = () => {
      refreshUserMeta();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "kili_local_users_meta" || event.key === "kili-local-user-meta-refresh") {
        refreshUserMeta();
      }
    };

    window.addEventListener("kili-local-user-meta-updated", handleMetaUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("kili-local-user-meta-updated", handleMetaUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Load immediately and then keep in sync via BroadcastChannel/storage polling
    setEaboState(loadPersistedEaboState());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === EABO_STORAGE_KEY) {
        setEaboState(loadPersistedEaboState());
      }
    };

    const channel = "BroadcastChannel" in window ? new BroadcastChannel("eabo-sim-state") : null;
    if (channel) {
      channel.onmessage = (event) => setEaboState(event.data as PersistedEaboState);
    }

    const refresh = window.setInterval(() => setEaboState(loadPersistedEaboState()), 3000);

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
      window.clearInterval(refresh);
    };
  }, []);

  const eaboMetrics = computeEaboMetrics(eaboState);
  const displayedBalance = userMeta.balance;
  const displayedEquity = eaboMetrics ? eaboMetrics.equity : userMeta.balance * 1.03;
  const displayedUsedMargin = eaboMetrics ? eaboMetrics.usedMargin : userMeta.balance * 0.32;
  const displayedFreeMargin = eaboMetrics ? eaboMetrics.freeMargin : userMeta.balance * 0.68;
  const displayedOpenPositions = eaboMetrics?.openPositions ?? 0;

  const accountRows = [
    ["Account ID", user?.id ? user.id.slice(0, 12).toUpperCase() : "DEMO-100294"],
    ["Currency", "USD"],
    ["Leverage", "1:100"],
    ["Balance", `$${displayedBalance.toFixed(2)}`],
    ["Equity", `$${displayedEquity.toFixed(2)}`],
    ["Used margin", `$${displayedUsedMargin.toFixed(2)}`],
    ["Free margin", `$${displayedFreeMargin.toFixed(2)}`],
    ["Open positions", String(displayedOpenPositions)],
  ] as const;

  const activityItems = [
    { time: "09:32:14", text: "Subscription confirmed for Pro Bot", kind: "info" },
    { time: "09:10:02", text: "Top-up request approved and credited", kind: "buy" },
    { time: "08:47:51", text: "Withdrawal request moved to pending approval", kind: "sell" },
  ];

  // Build dynamic pending requests from actual data
  const pendingRequests = [
    ...subscriptionRequests.map((r: any) => ({
      id: r.id,
      title: `Subscription - ${r.subscription_plan || 'Standard'}`,
      amount: Number(r.amount ?? 0),
      status: (r.status || r.subscription_status || 'pending').charAt(0).toUpperCase() + (r.status || r.subscription_status || 'pending').slice(1),
      type: 'subscription',
    })),
    ...topupRequests.map((r: any) => ({
      id: r.id,
      title: `Top-up (${r.network || 'Crypto'})`,
      amount: Number(r.amount ?? 0),
      status: (r.status || 'pending').charAt(0).toUpperCase() + (r.status || 'pending').slice(1),
      type: 'topup',
    })),
    ...withdrawalRequests.map((r: any) => ({
      id: r.id,
      title: `Withdrawal (${r.network || 'Crypto'})`,
      amount: Number(r.amount ?? 0),
      status: (r.status || 'pending').charAt(0).toUpperCase() + (r.status || 'pending').slice(1),
      type: 'withdrawal',
    })),
  ].sort((a: any, b: any) => {
    // Sort by status: pending first
    const statusOrder = { 'Pending': 0, 'Approved': 1, 'Declined': 2 };
    return (statusOrder[a.status as keyof typeof statusOrder] ?? 99) - (statusOrder[b.status as keyof typeof statusOrder] ?? 99);
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-2xl font-bold">Profile</h1>

      <section className="mt-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal information</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Account ID</dt>
            <dd className="num truncate text-xs">{user?.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Wallet Address</dt>
            <dd className="font-medium break-words max-w-[60%]">{userMeta.wallet_address ?? 'Not set'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subscription</dt>
            <dd className={`font-semibold ${userMeta.subscribed ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              {userMeta.subscribed ? `✓ ${userMeta.subscription_status?.toUpperCase() || 'ACTIVE'}` : `✗ ${userMeta.subscription_status || 'Inactive'}`}
            </dd>
          </div>
          {userMeta.subscribed && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-semibold text-primary">{userMeta.subscription_plan || 'Standard'}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Users Account Details</div>
        <div className="space-y-2">
          {accountRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-border/70 py-2 text-sm last:border-b-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</div>
        <div className="space-y-2 text-xs">
          {activityItems.map((item) => (
            <div key={item.time} className="flex gap-2 rounded-lg border border-border/70 bg-background/40 p-2">
              <span className="shrink-0 font-mono text-muted-foreground">{item.time}</span>
              <span className={item.kind === "buy" ? "text-emerald-400" : item.kind === "sell" ? "text-rose-400" : "text-muted-foreground"}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request history</div>
          <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${pendingRequests.length > 0 ? 'border-border bg-primary/10 text-primary' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
            {pendingRequests.length > 0 ? `${pendingRequests.length} Pending` : 'All Clear'}
          </div>
        </div>
        <div className="space-y-2">
          {pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
              No pending requests
            </div>
          ) : (
            pendingRequests.map((request: any) => {
              const statusColorMap: Record<string, string> = {
                'Pending': 'border-border bg-primary/10 text-primary',
                'Approved': 'border-green-500/30 bg-green-500/10 text-green-400',
                'Declined': 'border-red-500/30 bg-red-500/10 text-red-400',
              };
              const statusColor = statusColorMap[request.status] || statusColorMap['Pending'];

              return (
                <div key={request.id} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{request.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">${request.amount.toFixed(2)}</div>
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusColor}`}>
                      {request.status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Cable className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">MetaTrader 5</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Connect the account used for live execution.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center rounded-xl border border-border/70 bg-surface p-3">
          <Button onClick={() => setMt5Open(true)} className="h-11 rounded-xl">Connect MT5</Button>
          {((userMeta as any).mt5_status === 'pending' || mt5Pending) && <p className="mt-2 text-center text-xs font-medium text-amber-500">Connection pending</p>}
          {(userMeta as any).mt5_status && (
            <div className="mt-3 w-full text-sm">
              <div className="text-xs text-muted-foreground">MT5 Status</div>
              <div className="font-mono font-semibold">{String((userMeta as any).mt5_status)}</div>
              {((userMeta as any).mt5_status === 'approved' || (userMeta as any).mt5_connected) && (userMeta as any).mt5_details && (
                <div className="mt-2 space-y-1 text-xs">
                  <div><span className="text-muted-foreground">Login:</span> <span className="font-mono">{(userMeta as any).mt5_details.login ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Server:</span> <span className="font-mono">{(userMeta as any).mt5_details.server ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Password:</span> <span className="font-mono">{(userMeta as any).mt5_details.password ?? '—'}</span></div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Button
        variant="outline"
        className="mt-5 h-12 w-full rounded-xl"
        onClick={async () => {
          await supabase.auth.signOut();
          void navigate({ to: "/auth", replace: true });
        }}
      >
        Sign out
      </Button>

      <Dialog open={mt5Open} onOpenChange={setMt5Open}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect MetaTrader 5</DialogTitle>
            <DialogDescription>Enter your broker login details to request a live execution connection.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <Input
              value={mt5Form.login}
              onChange={(event) => setMt5Form((previous) => ({ ...previous, login: event.target.value }))}
              placeholder="Account login"
              className="h-12 rounded-xl bg-surface"
            />
            <Input
              type="password"
              value={mt5Form.password}
              onChange={(event) => setMt5Form((previous) => ({ ...previous, password: event.target.value }))}
              placeholder="Trading password"
              className="h-12 rounded-xl bg-surface"
            />
            <Input
              value={mt5Form.server}
              onChange={(event) => setMt5Form((previous) => ({ ...previous, server: event.target.value }))}
              placeholder="Broker server, e.g. Broker-Real"
              className="h-12 rounded-xl bg-surface"
            />
            <Button onClick={() => void submitMt5Request()} className="h-12 rounded-xl">Connect account</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
