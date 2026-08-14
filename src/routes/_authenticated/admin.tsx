import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured, isLocalMode, ADMIN_EMAIL, getLocalSession, getLocalUserMeta, writeLocalUserMeta } from "@/integrations/supabase/client";
import { NAV_PAGES, pageLockKey } from "@/lib/page-locks";
import { fetchTicker } from "@/lib/market/feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_PAYMENT_WALLETS, PAYMENT_WALLET_NETWORKS, getPaymentAddress, setPaymentWallets } from "@/lib/payment-wallets";
import { fetchAdminTradeOverview, adminAddBalance, adminResetBalance, approveSubscriptionRequest as approveSubscriptionRequestFn, declineSubscriptionRequest as declineSubscriptionRequestFn, updateUserSubscription, updateUserPageLocks, updateUserTradingOutcomeMode, adminCreateManualTrade } from "@/lib/admin-trades.functions";
import { debugEcho } from "@/lib/debug.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin · KiliMarkets" },
      { name: "description", content: "Admin panel for user and payments management." },
    ],
  }),
  component: AdminPage,
});

type MenuKey = "users" | "wallets" | "trades" | "topups" | "withdrawals" | "mt5" | "requests" | "subscriptions" | "pagelock";

function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [mt5Requests, setMt5Requests] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [adminUser, setAdminUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<MenuKey>("users");
  const [tradePreviewMode, setTradePreviewMode] = useState<"open" | "closed" | "all">("open");
  const [selectedLockUserId, setSelectedLockUserId] = useState<string | null>(null);
  const [selectedLockUserPageLocks, setSelectedLockUserPageLocks] = useState<Record<string, boolean>>({});
  const [outcomeSavingUserId, setOutcomeSavingUserId] = useState<string | null>(null);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletForm, setWalletForm] = useState({ network: "BTC" as keyof typeof DEFAULT_PAYMENT_WALLETS, address: DEFAULT_PAYMENT_WALLETS.BTC });

  const LOCAL_USERS_KEY = 'kili_local_auth_users';
  const LOCAL_USERS_META = 'kili_local_users_meta';

  function readLocalUsers(): any[] {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_USERS_KEY) : null;
      const metaRaw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_USERS_META) : null;
      const usersMap = raw ? JSON.parse(raw) : {};
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      return Object.keys(usersMap).map((email) => ({
        id: `local-${email}`,
        email,
        subscribed: !!meta[email]?.subscribed,
        subscription_status: meta[email]?.subscription_status ?? null,
        subscription_plan: meta[email]?.subscription_plan ?? null,
        balance: meta[email]?.balance ?? 0,
        locked: meta[email]?.locked ?? false,
        page_locks: meta[email]?.page_locks ?? {},
        wallet_address: meta[email]?.wallet_address ?? null,
      }));
    } catch (e) {
      return [];
    }
  }

  // Dialog state
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [balanceAmount, setBalanceAmount] = useState<string>("");
  const [tradeForm, setTradeForm] = useState({ symbol: "BTCUSD", dir: 1, lots: 0.1 });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Subscription editor state
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({
    subscribed: false,
    subscription_status: 'pending',
    subscription_plan: 'Basic',
    subscription_amount: 0,
    subscription_network: 'BTC',
  });

  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    void loadAll();
  }, [adminUser, authChecked]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'kili_local_mt5_requests') {
        try {
          const raw = window.localStorage.getItem('kili_local_mt5_requests');
          setMt5Requests(raw ? JSON.parse(raw) : []);
        } catch {
          // ignore
        }
      }
    };

    const handleCustom = () => {
      try {
        const raw = window.localStorage.getItem('kili_local_mt5_requests');
        setMt5Requests(raw ? JSON.parse(raw) : []);
      } catch {
        // ignore
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('kili-local-mt5-requests-updated', handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('kili-local-mt5-requests-updated', handleCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    // load current admin details from session
    void (async () => {
      try {
        let u: any = null;
        if (supabase?.auth && typeof supabase.auth.getSession === 'function') {
          const s = await supabase.auth.getSession();
          u = s?.data?.session?.user ?? null;
        }

        // fallback to local session if supabase auth isn't available or returned nothing
        if (!u) {
          const local = getLocalSession?.();
          u = local?.user ?? null;
        }

        setAdminUser(u);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    // ensure we mark auth as checked after attempting to read session
    void (async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        // ignore
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  function formatServerError(err: any) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err?.message) {
      const details = err?.details ? `\nDetails: ${err.details}` : "";
      const hint = err?.hint ? `\nHint: ${err.hint}` : "";
      const code = err?.code ? `Code: ${err.code}\n` : "";
      return `${code}${err.message}${details}${hint}`;
    }
    if (err?.error && typeof err.error === "object") {
      const code = err.error.code ? `Code: ${err.error.code}\n` : "";
      const message = err.error.message ?? "Unknown error";
      const details = err.error.details ? `\nDetails: ${err.error.details}` : "";
      const hint = err.error.hint ? `\nHint: ${err.error.hint}` : "";
      return `${code}${message}${details}${hint}`;
    }
    return JSON.stringify(err);
  }

  async function callDebug() {
    try {
      const res = await debugEcho();
      // Developer aid: log what the server received
      // eslint-disable-next-line no-console
      console.log("debugEcho result:", res);
      toast.success("Debug: server echoed headers (check console)");
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("debugEcho failed:", err);
      toast.error(formatServerError(err));
    }
  }

  const isAdmin = Boolean(adminUser?.email && adminUser.email === ADMIN_EMAIL);
  const visibleTrades = tradePreviewMode === "open"
    ? trades.filter((trade) => (trade.status ?? "open") === "open")
    : tradePreviewMode === "closed"
      ? trades.filter((trade) => (trade.status ?? "open") === "closed")
      : trades;

  async function safeSupabaseList<T = any>(
    table: string,
    select: string,
    configure?: (query: any) => any,
  ): Promise<T[]> {
    try {
      let query = supabase.from(table).select(select);
      if (configure) query = configure(query);
      const result = await query;
      if (result?.error) {
        console.warn(`[Admin] ${table} query failed:`, result.error.message ?? result.error);
        return [] as T[];
      }
      return ((result?.data ?? []) as T[]);
    } catch (err: any) {
      console.warn(`[Admin] ${table} unavailable:`, err?.message ?? err);
      return [] as T[];
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const useLocalFallback = isLocalMode() && !isAdmin;
      if (useLocalFallback || !supabase || typeof supabase.from !== 'function') {
        const localUsers = readLocalUsers();
        setUsers(localUsers);
        const readList = (k: string) => {
          try {
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem(k) : null;
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        };
        setWithdrawals(readList('kili_local_withdrawals'));
        setTopups(readList('kili_local_topups'));
        setTrades([...readList('kili_local_trades'), ...readList('kili_local_manual_trades')]);
        setMt5Requests(readList('kili_local_mt5_requests'));
        setRequests(readList('kili_local_account_change_requests'));
        setSubscriptionRequests(localUsers.filter((u) => u.subscription_status != null));
      } else {
        let adminOverview: { users?: any[]; trades?: any[]; manualTrades?: any[]; subscriptionRequests?: any[]; topups?: any[]; withdrawals?: any[]; mt5Requests?: any[]; requests?: any[] } | null = null;
        try {
          adminOverview = await fetchAdminTradeOverview();
        } catch (err) {
          console.warn("Admin trade overview server fetch failed, falling back:", err);
        }

        const [uData, wData, tpData, srData, mData, rData, botTradesFallback, manualTradesFallback] = await Promise.all([
          safeSupabaseList("users", "*", (query) => query.limit(500)),
          safeSupabaseList("withdrawals", "*", (query) => query.limit(500)),
          safeSupabaseList("topups", "*", (query) => query.limit(500)),
          safeSupabaseList("subscription_requests", "*", (query) => query.order("created_at", { ascending: false }).limit(500)),
          safeSupabaseList("mt5_requests", "*", (query) => query.limit(500)),
          safeSupabaseList("account_change_requests", "*", (query) => query.limit(500)),
          safeSupabaseList("bot_trades", "*", (query) => query.order("created_at", { ascending: false }).limit(500)),
          safeSupabaseList("manual_trades", "*", (query) => query.order("created_at", { ascending: false }).limit(500)),
        ]);

        const usersById = new Map((adminOverview?.users ?? uData ?? []).map((user: any) => [user.id, user]));
        
        // Build bot trades from adminOverview or fallback
        const botTrades = (adminOverview?.trades ?? botTradesFallback ?? []).map((trade: any) => ({
          ...trade,
          trade_source: "bot",
          trade_type: trade.trade_type ?? "bot",
          side: trade.side ?? (Number(trade.dir) === 1 ? "buy" : "sell"),
          volume: trade.volume ?? trade.lots,
          user_email: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
          user_name: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
          outcome: trade.outcome_mode ?? (trade.pnl == null ? "normal" : trade.pnl > 0 ? "profit" : trade.pnl < 0 ? "loss" : "normal"),
        }));

        // Build manual trades from adminOverview or fallback
        const manualTrades = (adminOverview?.manualTrades ?? manualTradesFallback ?? []).map((trade: any) => ({
          ...trade,
          trade_source: "manual",
          trade_type: trade.trade_type ?? "manual",
          side: Number(trade.dir) === 1 ? "buy" : "sell",
          volume: trade.lots,
          entry_price: trade.entry_price,
          user_email: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
          user_name: usersById.get(trade.user_id)?.email ?? trade.user_email ?? trade.user_id,
          outcome: trade.outcome_mode ?? "normal",
        }));

        const fallbackUsers = uData ?? [];
        const fallbackSubscriptions = srData ?? [];
        const allTrades = [...botTrades, ...manualTrades];

        setUsers(adminOverview?.users ?? fallbackUsers);
        setWithdrawals(adminOverview?.withdrawals ?? wData ?? []);
        setTopups(adminOverview?.topups ?? tpData ?? []);
        setTrades(allTrades);
        setMt5Requests(adminOverview?.mt5Requests ?? mData ?? []);
        setRequests(adminOverview?.requests ?? rData ?? []);
        setSubscriptionRequests(adminOverview?.subscriptionRequests ?? fallbackSubscriptions);
      }
    } catch (err: any) {
      console.warn("Admin loadAll partial failure:", err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }

  async function approveSubscription(user: any) {
    try {
      const updated = await supabase.from("users").update({ subscribed: true, subscription_status: "approved", subscription_plan: "upgraded" }).eq("id", user.id);
      if (updated.error) throw updated.error;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }
      toast.success(`Approved subscription for ${user.email}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to approve subscription");
    }
  }

  async function declineSubscription(user: any) {
    try {
      const updated = await supabase.from("users").update({ subscribed: false, subscription_status: "declined" }).eq("id", user.id);
      if (updated.error) throw updated.error;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }
      toast.success(`Declined subscription for ${user.email}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to decline subscription");
    }
  }

  function openAddBalance(user: any) {
    setSelectedUser(user);
    setBalanceAmount("");
    setBalanceDialogOpen(true);
  }

  async function confirmAddBalance() {
    if (!selectedUser) return;
    const rawAmount = String(balanceAmount ?? "").trim().replace(/,/g, "");
    const amt = Number(rawAmount);
    console.log("ADMIN ADD BALANCE:", {
      userId: selectedUser?.id,
      userIdType: typeof selectedUser?.id,
      amount: amt,
      amountType: typeof amt,
    });

    if (!selectedUser.id || typeof selectedUser.id !== "string") {
      toast.error("Admin add balance failed: selected user has invalid id");
      return;
    }

    if (!rawAmount || Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid numeric amount greater than 0");
      return;
    }
    try {
      const shouldUseLocalFallback = !isAdmin && (isLocalMode() || !supabase || typeof supabase.from !== 'function');
      if (shouldUseLocalFallback) {
        // local-mode: persist to local meta for non-admin users
        const email = selectedUser.email as string;
        const current = Number(selectedUser.balance ?? 0);
        const next = current + amt;
        writeLocalUserMeta(email, { balance: next });
        toast.success(`Added ${amt} to ${email}`);
        setBalanceDialogOpen(false);
        await loadAll();
        return;
      }

      // Use server-side admin function to update balance (service role)
      const payload = { userId: selectedUser.id, amount: Number(amt) };
      console.log("ADMIN ADD BALANCE PAYLOAD:", payload);
      const res = await adminAddBalance(payload);
      if (!res || (res as any).ok !== true) throw new Error('Failed to update balance');
      toast.success(`Added ${amount} to ${selectedUser.email}`);
      setBalanceDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(formatServerError(err) || "Failed to add balance");
    }
  }

  async function resetUserBalance(user: any) {
    if (!user) return;
    if (!user.id || typeof user.id !== "string") {
      toast.error("Admin reset balance failed: selected user has invalid id");
      return;
    }
    try {
      const shouldUseLocalFallback = !isAdmin && (isLocalMode() || !supabase || typeof supabase.from !== 'function');
      if (shouldUseLocalFallback) {
        const email = user.email as string;
        writeLocalUserMeta(email, { balance: 0 });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
          window.dispatchEvent(new Event('kili-local-user-meta-updated'));
        }
        toast.success(`Reset balance for ${email}`);
        await loadAll();
        return;
      }

      const payload = { userId: user.id };
      console.log("ADMIN RESET BALANCE PAYLOAD:", payload);
      const res = await adminResetBalance(payload);
      if (!res || (res as any).ok !== true) throw new Error('Failed to reset balance');
      // notify clients to refresh their view
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }
      toast.success(`Reset balance for ${user.email}`);
      await loadAll();
    } catch (err: any) {
      toast.error(formatServerError(err) || 'Failed to reset balance');
    }
  }

  async function saveUserOutcomeMode(user: any, mode: "normal" | "profit" | "loss") {
    try {
      setOutcomeSavingUserId(user.id);
      const result = await updateUserTradingOutcomeMode({ data: { userId: user.id, mode } });
      if (!result?.ok) throw new Error("Supabase did not confirm the outcome mode update");
      setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, trading_outcome_mode: mode } : item));
      toast.success(`Demo outcome for ${user.email} set to ${mode.toUpperCase()}`);
    } catch (err: any) {
      toast.error(formatServerError(err) || "Failed to save demo outcome mode");
    } finally {
      setOutcomeSavingUserId(null);
    }
  }

  function openCreateTrade(user: any) {
    setSelectedUser(user);
    setTradeForm({ symbol: "BTCUSD", dir: 1, lots: 0.1 });
    setTradeDialogOpen(true);
  }

  async function confirmCreateTrade() {
    if (!selectedUser) return;
    const { symbol, dir, lots } = tradeForm;
    if (!symbol || !lots || Number(lots) <= 0) {
      toast.error("Enter valid trade details");
      return;
    }
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        // local fallback: persist manual trade list in localStorage
        const key = 'kili_local_manual_trades';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        list.push({ id: `local-${Date.now()}`, user_id: selectedUser.id, user_email: selectedUser.email, symbol, dir, lots, status: 'open', created_at: new Date().toISOString() });
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(list));
        toast.success(`Manual trade opened for ${selectedUser.email}`);
        setTradeDialogOpen(false);
        await loadAll();
        return;
      }

      const ticker = await fetchTicker(symbol);
      const mode = selectedUser.trading_outcome_mode ?? "normal";
      const inserted = await adminCreateManualTrade({
        data: {
          userId: selectedUser.id,
          symbol,
          dir,
          lots,
          entryPrice: Number(ticker.price),
          outcomeMode: mode,
        },
      });
      if (!inserted?.ok) throw new Error("Supabase did not confirm the manual trade");
      toast.success(`Manual trade opened for ${selectedUser.email}`);
      setTradeDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to open manual trade");
    }
  }

  async function setTradeOutcome(trade: any, outcome: "normal" | "profit" | "loss") {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const updateLocalList = (key: string) => {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
          const list = raw ? JSON.parse(raw) : [];
          const next = list.map((t: any) => {
            if (t.id !== trade.id) return t;
            const pnl = outcome === "profit" ? Math.abs(Number(t.pnl ?? 0) || 25) : outcome === "loss" ? -Math.abs(Number(t.pnl ?? 0) || 25) : 0;
            return { ...t, outcome, pnl, status: 'closed' };
          });
          if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        };

        updateLocalList('kili_local_trades');
        updateLocalList('kili_local_manual_trades');
        toast.success(`Set trade ${trade.id} to ${outcome}`);
        await loadAll();
        return;
      }

      const currentEntry = Number(trade.entry_price ?? 0);
      const volume = Number(trade.volume ?? trade.lots ?? 1);
      const base = Math.max(Math.abs(currentEntry * volume * 0.02), 25);
      const pnl = outcome === "profit" ? base : outcome === "loss" ? -base : 0;
      const closedAt = new Date().toISOString();
      const table = trade.trade_source === "manual" ? "manual_trades" : "bot_trades";
      const payload: any = trade.trade_source === "manual"
        ? { pnl, status: "closed", exit_price: currentEntry, closed_at: closedAt, outcome_mode: outcome }
        : { pnl, status: "closed", exit_price: currentEntry, closed_at: closedAt, outcome_mode: outcome };
      const updated = await (supabase as any).from(table).update(payload).eq("id", trade.id);
      if (updated.error) throw updated.error;
      toast.success(`Set trade ${trade.id} to ${outcome}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to set trade outcome");
    }
  }

  async function processWithdrawal(withd: any, approve: boolean) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_withdrawals';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((w: any) => (w.id === withd.id ? { ...w, status: approve ? 'approved' : 'declined' } : w));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));

        if (approve && withd.userEmail) {
          const current = getLocalUserMeta(withd.userEmail).balance ?? 0;
          writeLocalUserMeta(withd.userEmail, { balance: current - Number(withd.amount ?? 0) });
        }

        if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
        toast.success(`${approve ? 'Approved' : 'Declined'} withdrawal ${withd.id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("withdrawals").update({ status: approve ? "approved" : "declined" }).eq("id", withd.id);
      if (updated.error) throw updated.error;
      
      if (approve) {
        const userId = withd.user_id ?? withd.userId ?? null;
        const userEmail = withd.user_email ?? withd.userEmail ?? null;
        if (userId) {
          const userData = await supabase.from("users").select("balance").eq("id", userId).single();
          if (!userData.error && userData.data) {
            const nextBalance = Number(userData.data.balance ?? 0) - Number(withd.amount ?? 0);
            await supabase.from("users").update({ balance: nextBalance }).eq("id", userId);
          }
        } else if (userEmail) {
          const userData = await supabase.from("users").select("id,balance").eq("email", userEmail).single();
          if (!userData.error && userData.data) {
            const nextBalance = Number(userData.data.balance ?? 0) - Number(withd.amount ?? 0);
            await supabase.from("users").update({ balance: nextBalance }).eq("id", userData.data.id);
          }
        }
      }
      
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
      toast.success(`${approve ? "Approved" : "Declined"} withdrawal ${withd.id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update withdrawal");
    }
  }

  async function processTopup(topup: any, approve: boolean) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_topups';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((t: any) => (t.id === topup.id ? { ...t, status: approve ? 'approved' : 'declined' } : t));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        if (approve && topup.userEmail) {
          const current = getLocalUserMeta(topup.userEmail).balance ?? 0;
          writeLocalUserMeta(topup.userEmail, { balance: current + Number(topup.amount ?? 0) });
        }
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
        toast.success(`${approve ? 'Approved' : 'Declined'} top-up ${topup.id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("topups").update({ status: approve ? "approved" : "declined" }).eq("id", topup.id);
      if (updated.error) throw updated.error;
      if (approve) {
        const userId = topup.user_id ?? topup.userId ?? null;
        const userEmail = topup.user_email ?? topup.userEmail ?? null;
        if (userId) {
          const userData = await supabase.from("users").select("balance").eq("id", userId).single();
          if (!userData.error && userData.data) {
            const nextBalance = Number(userData.data.balance ?? 0) + Number(topup.amount ?? 0);
            await supabase.from("users").update({ balance: nextBalance }).eq("id", userId);
          }
        } else if (userEmail) {
          const userData = await supabase.from("users").select("id,balance").eq("email", userEmail).single();
          if (!userData.error && userData.data) {
            const nextBalance = Number(userData.data.balance ?? 0) + Number(topup.amount ?? 0);
            await supabase.from("users").update({ balance: nextBalance }).eq("id", userData.data.id);
          }
        }
      }
      toast.success(`${approve ? "Approved" : "Declined"} top-up ${topup.id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update top-up");
    }
  }

  async function lockUser(user: any, lock: boolean) {
    try {
      if (isLocalMode()) {
        writeLocalUserMeta(user.email, { locked: lock });
        toast.success(`${lock ? "Locked" : "Unlocked"} ${user.email}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("users").update({ locked: lock }).eq("id", user.id);
      if (updated.error) throw updated.error;
      toast.success(`${lock ? "Locked" : "Unlocked"} ${user.email}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update lock");
    }
  }

  function openEditWalletDialog(network: keyof typeof DEFAULT_PAYMENT_WALLETS) {
    setWalletForm({ network, address: getPaymentAddress(network) });
    setWalletDialogOpen(true);
  }

  async function confirmSaveWallet() {
    const trimmedAddress = walletForm.address.trim();
    const safeAddress = trimmedAddress || DEFAULT_PAYMENT_WALLETS[walletForm.network];

    try {
      setPaymentWallets({ [walletForm.network]: safeAddress });
      toast.success(`Saved ${walletForm.network} wallet address`);
      setWalletDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save wallet address");
    }
  }

  // Subscription editor functions
  function openSubscriptionEditor(user: any) {
    setSelectedUser(user);
    setSubscriptionForm({
      subscribed: user.subscribed ?? false,
      subscription_status: user.subscription_status ?? 'pending',
      subscription_plan: user.subscription_plan ?? 'Basic',
      subscription_amount: Number(user.subscription_amount ?? 0),
      subscription_network: user.subscription_network ?? 'BTC',
    });
    setSubscriptionDialogOpen(true);
  }

  async function saveUserSubscription() {
    if (!selectedUser?.id) {
      toast.error("User not selected");
      return;
    }

    try {
      if (isLocalMode()) {
        writeLocalUserMeta(selectedUser.email, {
          subscribed: subscriptionForm.subscribed,
          subscription_status: subscriptionForm.subscription_status,
          subscription_plan: subscriptionForm.subscription_plan,
          subscription_amount: subscriptionForm.subscription_amount,
        });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
          window.dispatchEvent(new Event('kili-local-user-meta-updated'));
        }
        toast.success(`✓ Updated subscription for ${selectedUser.email}`);
        setSubscriptionDialogOpen(false);
        await loadAll();
        return;
      }

      await updateUserSubscription({
        userId: selectedUser.id,
        subscribed: subscriptionForm.subscribed,
        subscription_status: subscriptionForm.subscription_status,
        subscription_plan: subscriptionForm.subscription_plan,
        subscription_amount: subscriptionForm.subscription_amount,
        subscription_network: subscriptionForm.subscription_network,
      });

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }
      toast.success(`✓ Updated subscription for ${selectedUser.email}`);
      setSubscriptionDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save subscription");
      console.error('[Admin] save subscription failed', err);
    }
  }

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

  async function loadUserPageLocks(user: any) {
    if (!user) {
      setSelectedLockUserId(null);
      setSelectedLockUserPageLocks({});
      return;
    }

    setSelectedLockUserId(user.id);
    if (isLocalMode()) {
      setSelectedLockUserPageLocks(normalizePageLocks(user.page_locks ?? getLocalUserMeta(user.email ?? "").page_locks));
      return;
    }

    try {
      const { data, error } = await supabase.from("users").select("page_locks").eq("id", user.id).single();
      if (!error && data) {
        setSelectedLockUserPageLocks(normalizePageLocks(data.page_locks));
      } else {
        setSelectedLockUserPageLocks(normalizePageLocks(user.page_locks));
      }
    } catch {
      setSelectedLockUserPageLocks(normalizePageLocks(user.page_locks));
    }
  }

  function toggleSelectedUserPageLock(pageKey: string, locked: boolean) {
    setSelectedLockUserPageLocks((current) => ({ ...current, [pageKey]: locked }));
  }

  async function saveSelectedUserPageLocks() {
    if (!selectedLockUserId) {
      toast.error("Select a user first");
      return;
    }

    const targetUser = users.find((u) => u.id === selectedLockUserId);
    if (!targetUser) {
      toast.error("Selected user not found");
      return;
    }

    console.log('[Admin] saveSelectedUserPageLocks', { selectedLockUserId, selectedLockUserPageLocks, targetUser: targetUser.email });

    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        writeLocalUserMeta(targetUser.email, { page_locks: selectedLockUserPageLocks });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
          window.dispatchEvent(new Event('kili-local-user-meta-updated'));
        }
        toast.success(`Saved page locks for ${targetUser.email}`);
        await loadAll();
        return;
      }

      // Use server function to update with service role
      console.log('[Admin] Calling updateUserPageLocks with:', { userId: selectedLockUserId, pageLocks: selectedLockUserPageLocks });
      const savedLocks = await updateUserPageLocks({ data: { userId: selectedLockUserId, pageLocks: selectedLockUserPageLocks } });
      if (!savedLocks?.ok) throw new Error("Page locks were not confirmed by Supabase");
      setSelectedLockUserPageLocks(normalizePageLocks(savedLocks.pageLocks));
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }

      toast.success(`Saved page locks for ${targetUser.email}`);
      await loadAll();
    } catch (err: any) {
      console.error('[Admin] saveSelectedUserPageLocks error:', err);
      toast.error(err?.message ?? "Failed to save page locks");
    }
  }

  async function processMt5Request(req: any, approve: boolean) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_mt5_requests';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((r: any) => (r.id === req.id ? { ...r, status: approve ? 'approved' : 'declined' } : r));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        // update local user meta so profile reflects status
        try {
          const email = req.user_email ?? null;
          if (email) {
            if (approve) {
              writeLocalUserMeta(email, { mt5_connected: true, mt5_status: 'approved', mt5_details: { login: req.login, server: req.server, password: req.password ?? req.password_masked } });
            } else {
              writeLocalUserMeta(email, { mt5_connected: false, mt5_status: 'declined' });
            }
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
              window.dispatchEvent(new Event('kili-local-user-meta-updated'));
            }
          }
        } catch (e) {
          // ignore
        }
        toast.success(`${approve ? 'Approved' : 'Declined'} MT5 connect for ${req.user_email ?? req.user_id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("mt5_requests").update({ status: approve ? "approved" : "declined" }).eq("id", req.id);
      if (updated.error) throw updated.error;
      // attempt to persist result to user's row so profile shows status
      try {
        const userId = req.user_id ?? null;
        const userEmail = req.user_email ?? null;
        const details = { login: req.login ?? null, server: req.server ?? null, password: req.password ?? req.password_masked ?? null };
        if (userId) {
          await supabase.from('users').update({ mt5_connected: approve, mt5_status: approve ? 'approved' : 'declined', mt5_details: details }).eq('id', userId);
        } else if (userEmail) {
          const u = await supabase.from('users').select('id').eq('email', userEmail).single();
          if (!u.error && u.data) {
            await supabase.from('users').update({ mt5_connected: approve, mt5_status: approve ? 'approved' : 'declined', mt5_details: details }).eq('id', u.data.id);
          }
        }
      } catch (e) {
        // ignore failures updating users table
      }

      // notify other tabs to refresh
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
        window.dispatchEvent(new Event('kili-local-user-meta-updated'));
      }
      toast.success(`${approve ? "Approved" : "Declined"} MT5 connect for ${req.user_email ?? req.user_id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update MT5 request");
    }
  }

  async function processAccountRequest(r: any, approve: boolean) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_account_change_requests';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((req: any) => (req.id === r.id ? { ...req, status: approve ? 'approved' : 'declined' } : req));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        toast.success(`${approve ? 'Approved' : 'Declined'} account request ${r.id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("account_change_requests").update({ status: approve ? "approved" : "declined" }).eq("id", r.id);
      if (updated.error) throw updated.error;
      toast.success(`${approve ? "Approved" : "Declined"} account request ${r.id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update account request");
    }
  }

  async function handleApproveSubscriptionRequest(request: any) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_subscription_requests';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((r: any) => (r.id === request.id ? { ...r, status: 'approved' } : r));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        
        const userEmail = request.user_email ?? request.userEmail;
        if (userEmail) {
          writeLocalUserMeta(userEmail, {
            subscription_status: 'approved',
            subscribed: true,
            subscription_plan: request.subscription_plan ?? 'Pro Bot',
            subscription_amount: request.amount,
          });
        }
        
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
        toast.success(`Approved subscription ${request.id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("subscription_requests").update({ status: "approved" }).eq("id", request.id);
      if (updated.error) throw updated.error;
      
      // Also update the user's subscription status
      if (request.user_id) {
        const userUpdate = await supabase.from("users").update({
          subscribed: true,
          subscription_status: "approved",
          subscription_plan: request.subscription_plan,
          subscription_amount: request.amount,
        }).eq("id", request.user_id);
        if (userUpdate.error) throw userUpdate.error;
      }
      
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
      toast.success(`Approved subscription ${request.id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to approve subscription");
    }
  }

  async function handleDeclineSubscriptionRequest(request: any) {
    try {
      if ((isLocalMode() && !isAdmin) || !supabase || typeof supabase.from !== 'function') {
        const key = 'kili_local_subscription_requests';
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        const list = raw ? JSON.parse(raw) : [];
        const next = list.map((r: any) => (r.id === request.id ? { ...r, status: 'declined' } : r));
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
        
        const userEmail = request.user_email ?? request.userEmail;
        if (userEmail) {
          const meta = getLocalUserMeta(userEmail);
          const refundAmount = Number(meta.subscription_amount ?? 0);
          if (refundAmount > 0) {
            const currentBalance = Number(meta.balance ?? 0);
            writeLocalUserMeta(userEmail, {
              balance: currentBalance + refundAmount,
            });
          }
          writeLocalUserMeta(userEmail, {
            subscription_status: 'declined',
            subscribed: false,
          });
        }
        
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
        toast.success(`Declined subscription ${request.id}`);
        await loadAll();
        return;
      }

      const updated = await supabase.from("subscription_requests").update({ status: "declined" }).eq("id", request.id);
      if (updated.error) throw updated.error;
      
      // Also update the user's subscription status
      if (request.user_id) {
        const userUpdate = await supabase.from("users").update({
          subscribed: false,
          subscription_status: "declined",
        }).eq("id", request.user_id);
        if (userUpdate.error) throw userUpdate.error;
      }
      
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('kili-local-payments-updated'));
      toast.success(`Declined subscription ${request.id}`);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to decline subscription");
    }
  }

  if (!authChecked) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <h2 className="text-lg font-semibold">Admin</h2>
        <p className="mt-2 text-sm text-muted-foreground">Checking session…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <h2 className="text-lg font-semibold">Admin — Access denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">You must sign in as the admin account to access this page.</p>
        <p className="mt-2 text-sm">Admin account: <strong>{ADMIN_EMAIL}</strong></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-2xl font-bold mb-4">Admin</h1>
      {/* Mobile header with hamburger */}
      <div className="md:hidden flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">{adminUser?.email ?? 'Admin'}</div>
          <div className="text-xs text-muted-foreground">Admin</div>
        </div>
        <div>
          <Button onClick={() => setMobileOpen((v) => !v)}>{mobileOpen ? 'Close' : 'Menu'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <aside className="md:col-span-1 rounded-lg border bg-card p-4 hidden md:block">
          <div className="mb-4">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="font-semibold">{adminUser?.email ?? 'Unknown'}</div>
            <div className="text-xs text-muted-foreground">Role: Admin</div>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => setSelectedUser(adminUser)}>Act as Admin</Button>
              <Button onClick={() => setSelectedUser(null)}>Clear</Button>
              <Button onClick={() => void callDebug()} variant="outline">Debug headers</Button>
            </div>
          </div>
          <ul className="space-y-2">
            <li>
              <button onClick={() => setMenu("users")} className={`w-full text-left p-2 rounded ${menu === "users" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Users
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("subscriptions")} className={`w-full text-left p-2 rounded ${menu === "subscriptions" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Subscription Requests
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("trades")} className={`w-full text-left p-2 rounded ${menu === "trades" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Trades
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("topups")} className={`w-full text-left p-2 rounded ${menu === "topups" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Top-ups
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("withdrawals")} className={`w-full text-left p-2 rounded ${menu === "withdrawals" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Withdrawals
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("wallets")} className={`w-full text-left p-2 rounded ${menu === "wallets" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Wallets
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("mt5")} className={`w-full text-left p-2 rounded ${menu === "mt5" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                MT5 Requests
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("requests")} className={`w-full text-left p-2 rounded ${menu === "requests" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Account Requests
              </button>
            </li>
            <li>
              <button onClick={() => setMenu("pagelock")} className={`w-full text-left p-2 rounded ${menu === "pagelock" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                Page Lock
              </button>
            </li>
            <li>
              <Button onClick={() => void loadAll()} className="mt-3">Refresh</Button>
            </li>
          </ul>
        </aside>

        {/* Mobile slide-over menu */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="relative w-3/4 max-w-xs bg-card p-4">
              <div className="mb-4">
                <div className="text-sm font-semibold">{adminUser?.email ?? 'Admin'}</div>
                <div className="text-xs text-muted-foreground">Admin</div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => { setSelectedUser(adminUser); setMobileOpen(false); }}>Act as Admin</Button>
                  <Button onClick={() => { setSelectedUser(null); setMobileOpen(false); }}>Clear</Button>
                </div>
              </div>
              <ul className="space-y-2">
                <li>
                  <button onClick={() => { setMenu("users"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "users" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Users
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("trades"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "trades" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Trades
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("mt5"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "mt5" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    MT5 Requests
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("topups"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "topups" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Top-ups
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("withdrawals"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "withdrawals" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Withdrawals
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("wallets"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "wallets" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Wallets
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("subscriptions"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "subscriptions" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Subscription Requests
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("pagelock"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "pagelock" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Page Lock
                  </button>
                </li>
                <li>
                  <button onClick={() => { setMenu("requests"); setMobileOpen(false); }} className={`w-full text-left p-2 rounded ${menu === "requests" ? "bg-primary/10 font-semibold" : "hover:bg-surface"}`}>
                    Account Requests
                  </button>
                </li>
                <li>
                  <Button onClick={() => { void loadAll(); setMobileOpen(false); }} className="mt-3">Refresh</Button>
                </li>
              </ul>
            </div>
          </div>
        )}

        <section className="col-span-1 md:col-span-3">
          {menu === "users" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Users</h2>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">Email / ID</th>
                      <th className="p-2">Subscribed</th>
                      <th className="p-2">Balance</th>
                      <th className="p-2">Locked</th>
                      <th className="p-2">Demo Outcome</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="p-2">{u.email ?? u.id}</td>
                        <td className="p-2">{u.subscribed ? (u.subscription_plan ?? "Subscribed") : "—"}</td>
                        <td className="p-2">${Number(u.balance ?? 0).toFixed(2)}</td>
                        <td className="p-2">{u.locked ? "Locked" : ""}</td>
                        <td className="p-2">
                          <select
                            value={u.trading_outcome_mode ?? "normal"}
                            disabled={outcomeSavingUserId === u.id}
                            onChange={(e) => void saveUserOutcomeMode(u, e.target.value as "normal" | "profit" | "loss")}
                            className="rounded border bg-background px-2 py-1 text-xs"
                          >
                            <option value="normal">Normal</option>
                            <option value="profit">Profit</option>
                            <option value="loss">Loss</option>
                          </select>
                        </td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => void approveSubscription(u)}>Approve</Button>
                          {u.subscribed && <Button onClick={() => void declineSubscription(u)}>Revoke</Button>}
                          <Button onClick={() => openSubscriptionEditor(u)} variant="outline">Edit Sub</Button>
                          <Button onClick={() => openAddBalance(u)}>Add Balance</Button>
                          <Button onClick={() => void resetUserBalance(u)}>Reset</Button>
                          <Button onClick={() => openCreateTrade(u)}>Create Trade</Button>
                          <Button onClick={() => void lockUser(u, !u.locked)}>{u.locked ? 'Unlock' : 'Lock'}</Button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-sm text-muted-foreground">No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "trades" && (
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">Trades</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant={tradePreviewMode === "open" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTradePreviewMode("open")}
                  >
                    Open Positions
                  </Button>
                  <Button
                    variant={tradePreviewMode === "closed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTradePreviewMode("closed")}
                  >
                    Closed Positions
                  </Button>
                  <Button
                    variant={tradePreviewMode === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTradePreviewMode("all")}
                  >
                    All
                  </Button>
                </div>
              </div>
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-1">Open: {trades.filter((trade) => (trade.status ?? "open") === "open").length}</span>
                <span className="rounded-full border px-2 py-1">Closed: {trades.filter((trade) => (trade.status ?? "open") === "closed").length}</span>
                <span className="rounded-full border px-2 py-1">Total: {trades.length}</span>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">ID</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Symbol</th>
                      <th className="p-2">Side</th>
                      <th className="p-2">Volume</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">P/L</th>
                      <th className="p-2">Outcome</th>
                      <th className="p-2">Opened</th>
                      <th className="p-2">Closed</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrades.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-2">{t.id}</td>
                        <td className="p-2">{t.user_email ?? t.user_id}</td>
                        <td className="p-2 capitalize">{t.trade_type ?? t.trade_source ?? "bot"}</td>
                        <td className="p-2">{t.symbol}</td>
                        <td className="p-2">{t.side ?? t.dir ?? '—'}</td>
                        <td className="p-2">{t.volume ?? t.lots ?? '—'}</td>
                        <td className="p-2">{t.status ?? 'open'}</td>
                        <td className="p-2">{Number(t.pnl ?? 0).toFixed(2)}</td>
                        <td className="p-2 capitalize">{t.outcome_mode ?? t.outcome ?? "normal"}</td>
                        <td className="p-2 whitespace-nowrap">{t.opened_at ? new Date(t.opened_at).toLocaleString() : "—"}</td>
                        <td className="p-2 whitespace-nowrap">{t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {t.status === "open" ? "Outcome controlled per user" : "Closed"}
                        </td>
                      </tr>
                    ))}
                    {visibleTrades.length === 0 && (
                      <tr>
                        <td colSpan={12} className="p-4 text-sm text-muted-foreground">No {tradePreviewMode === "open" ? "active" : tradePreviewMode === "closed" ? "closed" : "trade"} records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "wallets" && (
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Wallet Management</h2>
                  <p className="text-sm text-muted-foreground">Update the payment addresses used for subscriptions and top-ups across the app.</p>
                </div>
                <Button onClick={() => openEditWalletDialog("BTC")}>
                  Edit Wallets
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">Network</th>
                      <th className="p-2">Wallet Address</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENT_WALLET_NETWORKS.map((network) => (
                      <tr key={network} className="border-t">
                        <td className="p-2">{network}</td>
                        <td className="p-2 break-words max-w-xl">{getPaymentAddress(network)}</td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => openEditWalletDialog(network)}>Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "subscriptions" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Subscription Requests</h2>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">User</th>
                      <th className="p-2">Requested Plan</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Network</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionRequests.map((s) => {
                      const status = (s.status ?? s.subscription_status ?? 'pending').toLowerCase();
                      const isPending = status === 'pending';
                      
                      return (
                        <tr key={s.id} className="border-t">
                          <td className="p-2">{s.user_email ?? s.userEmail ?? s.user_id ?? s.id}</td>
                          <td className="p-2">{s.subscription_plan ?? 'standard'}</td>
                          <td className="p-2">{typeof s.amount === 'number' ? `$${s.amount.toFixed(2)}` : s.amount ?? '—'}</td>
                          <td className="p-2">{s.network ?? '—'}</td>
                          <td className="p-2">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                              status === 'approved' ? 'bg-green-500/20 text-green-400' :
                              status === 'declined' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td className="p-2 flex gap-2">
                            {isPending ? (
                              <>
                                <Button 
                                  onClick={() => void handleApproveSubscriptionRequest(s)}
                                  size="sm"
                                  variant="default"
                                >
                                  Approve
                                </Button>
                                <Button 
                                  onClick={() => void handleDeclineSubscriptionRequest(s)}
                                  size="sm"
                                  variant="destructive"
                                >
                                  Decline
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                {status === 'approved' ? '✓ Processed' : '✗ Processed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {subscriptionRequests.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-sm text-muted-foreground">No subscription requests.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "topups" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Top-up Requests</h2>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">User</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Network</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topups.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-2">{t.userEmail ?? t.user_email ?? t.user_id ?? t.id}</td>
                        <td className="p-2">${Number(t.amount ?? 0).toFixed(2)}</td>
                        <td className="p-2">{t.network ?? '—'}</td>
                        <td className="p-2">{t.status}</td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => void processTopup(t, true)}>Approve</Button>
                          <Button onClick={() => void processTopup(t, false)}>Decline</Button>
                        </td>
                      </tr>
                    ))}
                    {topups.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-sm text-muted-foreground">No top-up requests.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "pagelock" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Page Lock</h2>
              <p className="mb-4 text-sm text-muted-foreground">Select a user and lock access to individual navigation pages.</p>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground">User</label>
                  <select
                    value={selectedLockUserId ?? ""}
                    onChange={(e) => {
                      const userId = e.target.value || null;
                      const user = users.find((u) => u.id === userId);
                      loadUserPageLocks(user);
                    }}
                    className="mt-1 w-full rounded border bg-background px-3 py-2"
                  >
                    <option value="">Select a user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email ?? u.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void saveSelectedUserPageLocks()} disabled={!selectedLockUserId}>
                    Save Locks
                  </Button>
                  <Button onClick={() => loadUserPageLocks(users.find((u) => u.id === selectedLockUserId) ?? null)}>
                    Reset
                  </Button>
                </div>
              </div>
              {!selectedLockUserId ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                  Select a user above to review and edit their per-page locks.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border bg-card p-3">
                  <table className="w-full table-auto text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="p-2">Page</th>
                        <th className="p-2">Locked</th>
                        <th className="p-2">Toggle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {NAV_PAGES.map((page) => {
                        const key = pageLockKey(page);
                        const locked = !!selectedLockUserPageLocks[key];
                        return (
                          <tr key={key} className="border-t">
                            <td className="p-2">{page.label}</td>
                            <td className="p-2">{locked ? 'Yes' : 'No'}</td>
                            <td className="p-2 flex gap-2">
                              <Button onClick={() => toggleSelectedUserPageLock(key, !locked)}>
                                {locked ? 'Unlock' : 'Lock'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {menu === "withdrawals" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Withdrawals</h2>
              <div className="overflow-x-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">ID</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Address</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="border-t">
                        <td className="p-2">{w.id}</td>
                        <td className="p-2">{w.userEmail ?? w.user_email ?? w.user_id ?? w.user ?? '—'}</td>
                        <td className="p-2">${Number(w.amount ?? 0).toFixed(2)}</td>
                        <td className="p-2">{w.address ?? w.dest_address ?? w.to_address ?? '—'}</td>
                        <td className="p-2">{w.status}</td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => void processWithdrawal(w, true)}>Approve</Button>
                          <Button onClick={() => void processWithdrawal(w, false)}>Decline</Button>
                        </td>
                      </tr>
                    ))}
                    {withdrawals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-sm text-muted-foreground">No withdrawals found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "mt5" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">MT5 Connect Requests</h2>
              <div className="overflow-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">ID</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Login</th>
                      <th className="p-2">Server</th>
                      <th className="p-2">Password</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mt5Requests.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.id}</td>
                        <td className="p-2">{r.user_email ?? r.user_id ?? '—'}</td>
                        <td className="p-2">{r.login ?? (typeof r.details === 'string' ? (() => { try { const d = JSON.parse(r.details); return d.login ?? '—'; } catch { return '—'; } })() : (r.details?.login ?? '—'))}</td>
                        <td className="p-2">{r.server ?? (typeof r.details === 'string' ? (() => { try { const d = JSON.parse(r.details); return d.server ?? '—'; } catch { return '—'; } })() : (r.details?.server ?? '—'))}</td>
                        <td className="p-2">{r.password ?? r.password_masked ?? '—'}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => void processMt5Request(r, true)}>Approve</Button>
                          <Button onClick={() => void processMt5Request(r, false)}>Decline</Button>
                        </td>
                      </tr>
                    ))}
                    {mt5Requests.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-4 text-sm text-muted-foreground">No MT5 requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {menu === "requests" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Account Change Requests</h2>
              <div className="overflow-auto rounded-lg border bg-card p-3">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-2">ID</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Details</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.id}</td>
                        <td className="p-2">{r.user_email ?? r.user_id}</td>
                        <td className="p-2">{r.type ?? 'update'}</td>
                        <td className="p-2">{r.payload ? JSON.stringify(r.payload) : r.details}</td>
                        <td className="p-2 flex gap-2">
                          <Button onClick={() => void processAccountRequest(r, true)}>Approve</Button>
                          <Button onClick={() => void processAccountRequest(r, false)}>Decline</Button>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-sm text-muted-foreground">No account change requests.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Wallet</DialogTitle>
            <DialogDescription>Update the wallet address used for the selected payment network.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div>
              <label className="text-sm text-muted-foreground">Network</label>
              <select
                value={walletForm.network}
                onChange={(event) => {
                  const network = event.target.value as keyof typeof DEFAULT_PAYMENT_WALLETS;
                  setWalletForm({ network, address: getPaymentAddress(network) });
                }}
                className="w-full rounded border border-border bg-background px-3 py-2"
              >
                {PAYMENT_WALLET_NETWORKS.map((network) => (
                  <option key={network} value={network}>{network}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Wallet address</label>
              <Input
                value={walletForm.address}
                onChange={(event) => setWalletForm((prev) => ({ ...prev, address: event.target.value }))}
                placeholder="Paste wallet address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setWalletDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void confirmSaveWallet()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Balance</DialogTitle>
            <DialogDescription>Manually add balance to the selected user's account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">User</div>
              <div className="font-semibold">{selectedUser?.email ?? selectedUser?.id}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Amount</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setBalanceDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void confirmAddBalance()}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Manual Trade</DialogTitle>
            <DialogDescription>Create a manual trade on behalf of the selected user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">User</div>
              <div className="font-semibold">{selectedUser?.email ?? selectedUser?.id}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Symbol</label>
              <Input value={tradeForm.symbol} onChange={(e) => setTradeForm((s) => ({ ...s, symbol: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Direction</label>
              <select value={tradeForm.dir} onChange={(e) => setTradeForm((s) => ({ ...s, dir: Number(e.target.value) }))} className="w-full rounded border px-2 py-2 bg-background">
                <option value={1}>Buy (1)</option>
                <option value={-1}>Sell (-1)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Lots</label>
              <Input type="number" value={tradeForm.lots} onChange={(e) => setTradeForm((s) => ({ ...s, lots: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTradeDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void confirmCreateTrade()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>Directly update user's subscription in Supabase. Changes sync immediately to user page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-muted-foreground">User</div>
              <div className="font-semibold">{selectedUser?.email ?? selectedUser?.id}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <select 
                value={subscriptionForm.subscription_status}
                onChange={(e) => setSubscriptionForm((s) => ({ ...s, subscription_status: e.target.value }))}
                className="w-full rounded border border-border bg-background px-3 py-2"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Plan</label>
              <Input 
                value={subscriptionForm.subscription_plan}
                onChange={(e) => setSubscriptionForm((s) => ({ ...s, subscription_plan: e.target.value }))}
                placeholder="e.g. Pro Bot, Basic"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Amount ($)</label>
              <Input 
                type="number"
                step="0.01"
                value={subscriptionForm.subscription_amount}
                onChange={(e) => setSubscriptionForm((s) => ({ ...s, subscription_amount: Number(e.target.value) }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Network</label>
              <select 
                value={subscriptionForm.subscription_network}
                onChange={(e) => setSubscriptionForm((s) => ({ ...s, subscription_network: e.target.value }))}
                className="w-full rounded border border-border bg-background px-3 py-2"
              >
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="subscribed"
                checked={subscriptionForm.subscribed}
                onChange={(e) => setSubscriptionForm((s) => ({ ...s, subscribed: e.target.checked }))}
                className="h-4 w-4 rounded border border-gray-300"
              />
              <label htmlFor="subscribed" className="text-sm text-muted-foreground">Mark as subscribed</label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSubscriptionDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveUserSubscription()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default AdminPage;
