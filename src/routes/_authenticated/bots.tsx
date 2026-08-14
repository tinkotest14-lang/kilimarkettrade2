import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useBotEngine } from "@/lib/bot/runner";
import { STRATEGIES, STRATEGY_GROUPS, defaultParams, getStrategy } from "@/lib/strategies";
import { SYMBOLS, TIMEFRAMES, type Timeframe } from "@/lib/market/symbols";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({
    meta: [
      { title: "Trading Bots \u00b7 KiliMarkets" },
      { name: "description", content: "Configure, launch and monitor automated trading strategies on live market data." },
      { property: "og:title", content: "Trading Bots \u00b7 KiliMarkets" },
      { property: "og:description", content: "Configure, launch and monitor automated trading strategies." },
    ],
  }),
  component: BotsPage,
});

function BotsPage() {
  const { sessions, logs, refresh, loadLogs, setStatus, remove } = useBotEngine();
  const [strategyKey, setStrategyKey] = useState(STRATEGIES[0].key);
  const strategy = getStrategy(strategyKey);
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams(strategy));
  const [symbol, setSymbol] = useState(strategy.defaultSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(strategy.defaultTimeframe as Timeframe);
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [docOpen, setDocOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openLogs, setOpenLogs] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function pickStrategy(key: string) {
    const next = getStrategy(key);
    setStrategyKey(key);
    setParams(defaultParams(next));
    setSymbol(next.defaultSymbol);
    setTimeframe(next.defaultTimeframe as Timeframe);
  }

  async function start() {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      toast.error("Session expired, sign in again");
      return;
    }
    const { error } = await supabase.from("bot_sessions").insert({
      user_id: auth.user.id,
      strategy_key: strategy.key,
      strategy_label: strategy.label,
      symbol,
      timeframe,
      params,
      mode,
      status: "running",
      check_seconds: 15,
      started_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${strategy.label} started on ${symbol} ${timeframe}`);
    await refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-2xl font-bold">Bots</h1>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Select value={strategyKey} onValueChange={pickStrategy}>
            <SelectTrigger className="h-12 flex-1 rounded-xl bg-surface text-base font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_GROUPS.map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {STRATEGIES.filter((s) => s.group === group).map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="size-12 rounded-xl"
            aria-label="Strategy documentation"
            onClick={() => setDocOpen(true)}
          >
            <Info className="size-5" />
          </Button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{strategy.doc.tagline}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Symbol">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-11 rounded-lg bg-surface"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Timeframe">
            <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
              <SelectTrigger className="h-11 rounded-lg bg-surface"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {strategy.params.map((spec) => (
            <Field key={spec.key} label={spec.label}>
              <Input
                type="number"
                inputMode="decimal"
                step={spec.step}
                min={spec.min}
                max={spec.max}
                value={params[spec.key] ?? spec.default}
                onChange={(e) =>
                  setParams((prev) => ({ ...prev, [spec.key]: Number(e.target.value) }))
                }
                className="h-11 rounded-lg bg-surface num"
              />
            </Field>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {(["paper", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors",
                mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {m === "paper" ? "Paper" : "Live (MT5)"}
            </button>
          ))}
        </div>

        <Button onClick={start} disabled={busy} className="mt-4 h-14 w-full rounded-xl text-base font-semibold">
          {busy ? "Starting\u2026" : "Start"}
        </Button>
      </section>

      <h2 className="mt-7 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</h2>
      <ul className="mt-2 space-y-3">
        {sessions.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No bot sessions yet. Configure a strategy above and press Start.
          </li>
        )}
        {sessions.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{s.strategy_label}</p>
                <p className="text-xs text-muted-foreground num">
                  {s.symbol} \u00b7 {s.timeframe} \u00b7 {s.mode}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-bold uppercase",
                  s.status === "running" && "bg-primary/15 text-primary",
                  s.status === "paused" && "bg-warning/15 text-warning",
                  s.status === "error" && "bg-destructive/15 text-destructive",
                  (s.status === "stopped" || s.status === "waiting" || s.status === "disconnected") &&
                    "bg-secondary text-muted-foreground",
                )}
              >
                {s.status}
              </span>
            </div>

            <div className="mt-2 flex gap-4 text-xs num text-muted-foreground">
              <span>Trades {s.trades_count}</span>
              <span>Wins {s.wins_count}</span>
              <span className={s.pnl >= 0 ? "text-bull" : "text-bear"}>PnL {s.pnl.toFixed(2)}</span>
            </div>
            {s.last_signal && <p className="mt-2 text-xs text-muted-foreground">{s.last_signal}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {s.status === "running" ? (
                <Button size="sm" variant="outline" onClick={() => void setStatus(s.id, "paused")}>
                  <Pause className="size-4" /> Pause
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void setStatus(s.id, "running")}>
                  <Play className="size-4" /> {s.status === "paused" ? "Resume" : "Start"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void setStatus(s.id, "stopped")}>
                <Square className="size-4" /> Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenLogs(openLogs === s.id ? null : s.id);
                  void loadLogs(s.id);
                }}
              >
                Logs
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remove(s.id)} aria-label="Delete session">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>

            {openLogs === s.id && (
              <ul className="mt-3 max-h-56 space-y-1 overflow-auto rounded-lg bg-surface p-3 text-xs num">
                {(logs[s.id] ?? []).map((l) => (
                  <li key={l.id} className="text-muted-foreground">
                    <span className="text-foreground">{new Date(l.created_at).toLocaleTimeString()}</span> {l.message}
                  </li>
                ))}
                {(logs[s.id] ?? []).length === 0 && <li className="text-muted-foreground">No logs yet.</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{strategy.label}</DialogTitle>
            <DialogDescription>{strategy.doc.tagline}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <Doc title="Best for" body={strategy.doc.bestFor} />
            <Doc title="Timeframe" body={strategy.doc.timeframe} />
            <Doc title="How it trades" body={strategy.doc.howItTrades} />
            <div>
              <h3 className="font-semibold text-foreground">How to run it</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                {strategy.doc.howToRun.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </div>
            <Doc title="What to expect" body={strategy.doc.whatToExpect} />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Doc({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}
