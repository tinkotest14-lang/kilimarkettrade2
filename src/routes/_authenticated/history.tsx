import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Activity, Bot, Clock3, PauseCircle, PlayCircle, TrendingUp } from "lucide-react";
import { useBotEngine } from "@/lib/bot/runner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Bot Activity · KiliMarkets" },
      { name: "description", content: "See which trading bots are active, paused or idle and review their latest signals." },
      { property: "og:title", content: "Bot Activity · KiliMarkets" },
      { property: "og:description", content: "Monitor active and inactive trading bot sessions." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { sessions, logs, refresh, loadLogs } = useBotEngine();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (sessions.length === 0) return;
    void Promise.all(sessions.slice(0, 6).map((session) => loadLogs(session.id)));
  }, [loadLogs, sessions]);

  const summary = useMemo(() => {
    const active = sessions.filter((session) => session.status === "running").length;
    const paused = sessions.filter((session) => session.status === "paused").length;
    const idle = sessions.filter((session) => ["waiting", "stopped", "disconnected", "error"].includes(session.status)).length;
    const trades = sessions.reduce((sum, session) => sum + session.trades_count, 0);
    const pnl = sessions.reduce((sum, session) => sum + session.pnl, 0);
    return { active, paused, idle, trades, pnl };
  }, [sessions]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <header className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <Clock3 className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Bot activity</p>
          <h1 className="text-2xl font-bold">Trading history</h1>
        </div>
      </header>

      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <StatCard label="Active" value={summary.active.toString()} hint="Currently trading" tone="bull" />
        <StatCard label="Paused" value={summary.paused.toString()} hint="On hold" />
        <StatCard label="Idle" value={summary.idle.toString()} hint="Waiting or stopped" />
        <StatCard label="Total trades" value={summary.trades.toString()} hint="Recorded across sessions" />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Bot sessions</p>
            <p className="text-xs text-muted-foreground">Live status, signals and recent activity from your trading bots.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="size-3.5" />
            {summary.active > 0 ? "Trading now" : "Not trading"}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No bot sessions yet. Start a bot from the Bots page to populate this history view.</div>
        ) : (
          <ul className="divide-y divide-border/70">
            {sessions.map((session) => (
              <li key={session.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-primary" />
                      <p className="font-semibold">{session.strategy_label}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {session.symbol} · {session.timeframe} · {session.mode}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase", statusClass(session.status))}>
                    {session.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <PlayCircle className="size-4" />
                    {session.last_signal || "Waiting for first signal"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="size-4" />
                    {session.trades_count} trades · {session.wins_count} wins
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <PauseCircle className="size-4" />
                    {formatMoney(session.pnl)} PnL
                  </span>
                </div>

                {logs[session.id]?.length ? (
                  <ul className="mt-3 space-y-1 rounded-xl border border-border/70 bg-surface/70 p-3 text-sm text-muted-foreground">
                    {logs[session.id].slice(0, 3).map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2">
                        <span className="mt-0.5 size-2 rounded-full bg-primary" />
                        <span>{entry.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
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

function statusClass(status: string) {
  if (status === "running") return "bg-primary/10 text-primary";
  if (status === "paused") return "bg-warning/10 text-warning";
  if (status === "error") return "bg-destructive/10 text-destructive";
  return "bg-secondary text-muted-foreground";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}
