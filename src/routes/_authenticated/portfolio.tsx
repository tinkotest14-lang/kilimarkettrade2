import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchTicker } from "@/lib/market/feed";
import { cn } from "@/lib/utils";

interface PortfolioItem {
  symbol: string;
  side: string;
  volume: number;
  entry_price: number;
  pnl: number | null;
  status: string;
}

interface PortfolioTransaction {
  id: string;
  type: "top-up" | "withdrawal";
  amount: number;
  timestamp: string;
}

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · KiliMarkets" },
      { name: "description", content: "Track your open positions, cash balance and account flow." },
      { property: "og:title", content: "Portfolio · KiliMarkets" },
      { property: "og:description", content: "Track your open positions and portfolio health." },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const storageKey = user?.id ? `portfolio:${user.id}` : "portfolio:guest";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { balance?: number; transactions?: PortfolioTransaction[] };
      setBalance(Number(parsed.balance ?? 0));
      setTransactions(parsed.transactions ?? []);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({ balance, transactions }));
  }, [balance, storageKey, transactions]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        if (active) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("bot_trades")
        .select("symbol, side, volume, entry_price, pnl, status")
        .eq("user_id", userId)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (active) {
        if (!error) setPositions((data ?? []) as PortfolioItem[]);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (positions.length === 0) {
      setLivePrices({});
      return;
    }

    let active = true;
    void (async () => {
      const nextPrices: Record<string, number> = {};
      for (const position of positions) {
        try {
          const ticker = await fetchTicker(position.symbol);
          nextPrices[position.symbol] = ticker.price;
        } catch {
          nextPrices[position.symbol] = position.entry_price;
        }
      }
      if (active) setLivePrices(nextPrices);
    })();

    return () => {
      active = false;
    };
  }, [positions]);

  const adjustedPositions = useMemo(() => {
    return positions.map((position) => {
      const currentPrice = livePrices[position.symbol] ?? position.entry_price;
      const isLong = ["buy", "long"].includes(position.side.toLowerCase());
      const unrealized = isLong ? (currentPrice - position.entry_price) * position.volume : (position.entry_price - currentPrice) * position.volume;
      return { ...position, unrealized };
    });
  }, [livePrices, positions]);

  const summary = useMemo(() => {
    const openPositions = adjustedPositions.length;
    const notional = adjustedPositions.reduce((sum, item) => sum + item.volume * item.entry_price, 0);
    const unrealized = adjustedPositions.reduce((sum, item) => sum + item.unrealized, 0);
    return { openPositions, notional, unrealized, balance };
  }, [adjustedPositions, balance]);

  function handleTransaction(type: "top-up" | "withdrawal") {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount above zero.");
      return;
    }

    if (type === "withdrawal" && parsedAmount > balance) {
      toast.error("Insufficient balance for this withdrawal.");
      return;
    }

    const nextBalance = type === "top-up" ? balance + parsedAmount : balance - parsedAmount;
    const nextTransaction: PortfolioTransaction = {
      id: `${type}-${Date.now()}`,
      type,
      amount: parsedAmount,
      timestamp: new Date().toISOString(),
    };

    setBalance(nextBalance);
    setTransactions((prev) => [nextTransaction, ...prev].slice(0, 8));
    setAmount("");
    toast.success(type === "top-up" ? "Top-up completed." : "Withdrawal completed.");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <header className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <BriefcaseBusiness className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Overview</p>
          <h1 className="text-2xl font-bold">Portfolio</h1>
        </div>
      </header>

      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <StatCard label="Open positions" value={summary.openPositions.toString()} hint="Currently active" />
        <StatCard label="Notional" value={formatMoney(summary.notional)} hint="Exposure" />
        <StatCard label="Unrealized PnL" value={formatMoney(summary.unrealized)} hint="Floating result" tone={summary.unrealized >= 0 ? "bull" : "bear"} />
        <StatCard label="Cash balance" value={formatMoney(summary.balance)} hint="Available cash" />
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Amount</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="h-11 rounded-xl bg-surface"
            />
          </label>
          <Button onClick={() => handleTransaction("top-up")} className="h-11 rounded-xl px-4">
            Top up
          </Button>
          <Button variant="outline" onClick={() => handleTransaction("withdrawal")} className="h-11 rounded-xl px-4">
            Withdraw
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-surface/70 p-3">
          <p className="text-sm font-semibold">Recent account activity</p>
          {transactions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No cash movements yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/50 px-2.5 py-2">
                  <span className="capitalize">{transaction.type.replace("-", " ")}</span>
                  <span className={cn("font-semibold", transaction.type === "top-up" ? "text-bull" : "text-bear")}>
                    {transaction.type === "top-up" ? "+" : "-"}
                    {formatMoney(transaction.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Current exposure</p>
            <p className="text-xs text-muted-foreground">Your active market positions and sizing.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Wallet className="size-3.5" />
            Risk view
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading portfolio…</div>
        ) : adjustedPositions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">You do not have any open positions right now.</div>
        ) : (
          <ul className="divide-y divide-border/70">
            {adjustedPositions.map((position, index) => (
              <li key={`${position.symbol}-${index}`} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="font-semibold">{position.symbol}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {position.side.toUpperCase()} · {position.volume.toFixed(2)} lots · Entry {formatMoney(position.entry_price)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                    <TrendingUp className="size-3.5" />
                    {position.status}
                  </div>
                  <p className={cn("mt-2 text-sm font-semibold", position.unrealized >= 0 ? "text-bull" : "text-bear")}>
                    {formatMoney(position.unrealized)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "default" | "bull" | "bear" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}
