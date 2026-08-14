import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { fetchCandles, subscribeTicker, type Candle } from "../market/feed";
import { getSymbolSpec, type Timeframe } from "../market/symbols";
import { atr } from "../indicators";
import { evaluateStrategy, type Side } from "./signals";
import { mt5ClosePosition, mt5PlaceOrder } from "../mt5/bridge.functions";

export type BotStatus = "running" | "paused" | "stopped" | "waiting" | "error" | "disconnected";

export interface BotSession {
  id: string;
  strategy_key: string;
  strategy_label: string;
  symbol: string;
  timeframe: string;
  check_seconds: number;
  params: Record<string, number>;
  status: BotStatus;
  mode: "paper" | "live";
  trades_count: number;
  wins_count: number;
  pnl: number;
  last_signal: string | null;
  last_checked_at: string | null;
  started_at: string | null;
  created_at: string;
}

export interface BotLog {
  id: string;
  session_id: string;
  level: string;
  message: string;
  created_at: string;
}

interface OpenTrade {
  id: string;
  side: Side;
  entry: number;
  volume: number;
  stop: number;
  target: number;
  initialRisk: number;
  atrAtEntry: number;
  breakEvenDone: boolean;
  ticket: string | null;
  outcomeMode: "normal" | "profit" | "loss";
}

interface Runtime {
  timer: ReturnType<typeof setInterval> | null;
  unsubscribe: (() => void) | null;
  price: number;
  trade: OpenTrade | null;
  busy: boolean;
}

interface EngineState {
  sessions: BotSession[];
  logs: Record<string, BotLog[]>;
  prices: Record<string, number>;
  setSessions: (s: BotSession[]) => void;
  refresh: () => Promise<void>;
  loadLogs: (sessionId: string) => Promise<void>;
  attach: (session: BotSession) => void;
  detach: (sessionId: string) => void;
  setStatus: (sessionId: string, status: BotStatus) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
}

const runtimes = new Map<string, Runtime>();
const EQUITY_FALLBACK = 10000;

async function log(sessionId: string, userId: string, level: string, message: string) {
  await supabase.from("bot_logs").insert({ session_id: sessionId, user_id: userId, level, message });
  const state = useBotEngine.getState();
  const entry: BotLog = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    level,
    message,
    created_at: new Date().toISOString(),
  };
  useBotEngine.setState({
    logs: { ...state.logs, [sessionId]: [entry, ...(state.logs[sessionId] ?? [])].slice(0, 200) },
  });
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function positionSize(equity: number, riskPct: number, stopDistance: number, price: number, notionalCapPct: number) {
  if (stopDistance <= 0 || price <= 0) return 0;
  const riskAmount = (equity * riskPct) / 100;
  let size = riskAmount / stopDistance;
  const maxNotional = (equity * notionalCapPct) / 100;
  if (size * price > maxNotional) size = maxNotional / price;
  return Math.max(0, Number(size.toFixed(6)));
}

async function openTrade(session: BotSession, side: Side, price: number, atrValue: number, userId: string) {
  const rt = runtimes.get(session.id);
  if (!rt) return;
  const p = session.params;
  const stopDistance = (p.hard_stop_atr ?? 2) * atrValue;
  if (stopDistance <= 0) return;
  const volume = positionSize(EQUITY_FALLBACK, p.risk_pct ?? 1, stopDistance, price, p.notional_cap ?? 30);
  if (volume <= 0) {
    await log(session.id, userId, "warn", "Position size resolved to zero \u2014 skipping entry");
    return;
  }
  const stop = side === "buy" ? price - stopDistance : price + stopDistance;
  const target =
    side === "buy" ? price + stopDistance * (p.tp_r ?? 2) : price - stopDistance * (p.tp_r ?? 2);

  let ticket: string | null = null;
  let fillPrice = price;
  if (session.mode === "live") {
    try {
      const result = await mt5PlaceOrder({
        data: {
          symbol: session.symbol,
          side,
          volume,
          stopLoss: stop,
          takeProfit: target,
          comment: session.strategy_key,
        },
      });
      ticket = result.ticket;
      fillPrice = result.price || price;
    } catch (error) {
      await log(session.id, userId, "error", `MT5 rejected the order: ${(error as Error).message}`);
      await useBotEngine.getState().setStatus(session.id, "error");
      return;
    }
  }

  let outcomeMode: "normal" | "profit" | "loss" = "normal";
  if (session.mode === "paper") {
    const { data: userRow } = await (supabase as any).from("users").select("trading_outcome_mode").eq("id", userId).maybeSingle();
    if (userRow?.trading_outcome_mode === "profit" || userRow?.trading_outcome_mode === "loss") {
      outcomeMode = userRow.trading_outcome_mode;
    }
  }

  const { data, error } = await (supabase as any)
    .from("bot_trades")
    .insert({
      user_id: userId,
      session_id: session.id,
      symbol: session.symbol,
      side,
      volume,
      entry_price: fillPrice,
      stop_loss: stop,
      take_profit: target,
      status: "open",
      ticket,
      outcome_mode: outcomeMode,
    })
    .select("id")
    .single();
  if (error || !data) {
    await log(session.id, userId, "error", `Could not record the trade: ${error?.message}`);
    return;
  }

  rt.trade = {
    id: data.id,
    side,
    entry: fillPrice,
    volume,
    stop,
    target,
    initialRisk: stopDistance,
    atrAtEntry: atrValue,
    breakEvenDone: false,
    ticket,
    outcomeMode,
  };
  const digits = getSymbolSpec(session.symbol).digits;
  await log(
    session.id,
    userId,
    "trade",
    `${side.toUpperCase()} ${volume} ${session.symbol} @ ${fillPrice.toFixed(digits)} \u00b7 SL ${stop.toFixed(digits)} \u00b7 TP ${target.toFixed(digits)}`,
  );
}

async function closeTrade(session: BotSession, price: number, reason: string, userId: string) {
  const rt = runtimes.get(session.id);
  if (!rt?.trade) return;
  const trade = rt.trade;
  let exit = price;
  if (session.mode === "live" && trade.ticket) {
    try {
      const result = await mt5ClosePosition({ data: { ticket: trade.ticket } });
      exit = result.price || price;
    } catch (error) {
      await log(session.id, userId, "error", `MT5 could not close the position: ${(error as Error).message}`);
      return;
    }
  }
  const rawPnl = (trade.side === "buy" ? exit - trade.entry : trade.entry - exit) * trade.volume;
  let pnl = rawPnl;
  if (session.mode === "paper" && trade.outcomeMode !== "normal") {
    const fallback = Math.max(Math.abs(trade.entry * trade.volume * 0.02), 25);
    pnl = trade.outcomeMode === "profit" ? Math.max(Math.abs(rawPnl), fallback) : -Math.max(Math.abs(rawPnl), fallback);
    if (trade.volume > 0) {
      exit = trade.side === "buy" ? trade.entry + pnl / trade.volume : trade.entry - pnl / trade.volume;
    }
  }
  rt.trade = null;

  await (supabase as any)
    .from("bot_trades")
    .update({ exit_price: exit, pnl, status: "closed", closed_at: new Date().toISOString(), outcome_mode: trade.outcomeMode })
    .eq("id", trade.id);

  const { data: realTrade } = await supabase.from("bot_trades").select("id, pnl, symbol, side, volume").eq("id", trade.id).single();
  if (realTrade) {
    const tradePnl = Number(realTrade.pnl ?? 0);
    const tradeLabel = `${realTrade.symbol} ${realTrade.side === "buy" ? "long" : "short"}`;
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "Trade Closed",
      title: `${tradeLabel} closed`,
      body: `${tradeLabel} closed with ${tradePnl >= 0 ? "+" : ""}${tradePnl.toFixed(2)} P/L`,
    });
  }

  const session_ = useBotEngine.getState().sessions.find((s) => s.id === session.id) ?? session;
  const trades_count = session_.trades_count + 1;
  const wins_count = session_.wins_count + (pnl > 0 ? 1 : 0);
  const total = Number(session_.pnl) + pnl;
  await supabase.from("bot_sessions").update({ trades_count, wins_count, pnl: total }).eq("id", session.id);
  useBotEngine.setState({
    sessions: useBotEngine
      .getState()
      .sessions.map((s) => (s.id === session.id ? { ...s, trades_count, wins_count, pnl: total } : s)),
  });
  await log(
    session.id,
    userId,
    pnl >= 0 ? "success" : "warn",
    `Closed ${trade.side.toUpperCase()} \u2014 ${reason}. P/L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
  );
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "Trade Closed",
    title: `${session.strategy_label} closed a ${trade.side} on ${session.symbol}`,
    body: `${reason} \u00b7 P/L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
  });
}

function manageOpenTrade(session: BotSession, price: number, userId: string) {
  const rt = runtimes.get(session.id);
  if (!rt?.trade) return;
  const t = rt.trade;
  const p = session.params;
  const dir = t.side === "buy" ? 1 : -1;
  const moved = (price - t.entry) * dir;

  if (p.breakeven_atr && !t.breakEvenDone && moved >= p.breakeven_atr * t.atrAtEntry) {
    t.stop = t.entry;
    t.breakEvenDone = true;
    void log(session.id, userId, "info", "Stop moved to break-even");
  }
  if (p.trail_atr) {
    const trail = price - dir * p.trail_atr * t.atrAtEntry;
    if (dir === 1 ? trail > t.stop : trail < t.stop) t.stop = trail;
  }
  if (dir === 1 ? price <= t.stop : price >= t.stop) {
    void closeTrade(session, price, t.breakEvenDone ? "trailing stop hit" : "stop loss hit", userId);
    return;
  }
  if (dir === 1 ? price >= t.target : price <= t.target) {
    void closeTrade(session, price, "take-profit reached", userId);
  }
}

async function runCheck(session: BotSession, userId: string) {
  const rt = runtimes.get(session.id);
  if (!rt || rt.busy) return;
  rt.busy = true;
  try {
    const candles: Candle[] = await fetchCandles(session.symbol, session.timeframe as Timeframe, 300);
    const closed = candles.slice(0, -1);
    const price = rt.price || candles[candles.length - 1].close;
    await supabase
      .from("bot_sessions")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", session.id);

    if (rt.trade) {
      manageOpenTrade(session, price, userId);
      return;
    }
    const signal = evaluateStrategy(session.strategy_key, closed, session.params);
    const atrNow = signal.atr || (atr(closed, 14).at(-1) ?? 0) || 0;
    if (signal.side) {
      await supabase.from("bot_sessions").update({ last_signal: signal.reason, status: "running" }).eq("id", session.id);
      await openTrade(session, signal.side, price, atrNow, userId);
    } else {
      await supabase.from("bot_sessions").update({ last_signal: signal.reason }).eq("id", session.id);
      await log(session.id, userId, "info", signal.reason);
    }
    useBotEngine.setState({
      sessions: useBotEngine
        .getState()
        .sessions.map((s) =>
          s.id === session.id ? { ...s, last_signal: signal.reason, last_checked_at: new Date().toISOString() } : s,
        ),
    });
  } catch (error) {
    await log(session.id, userId, "error", (error as Error).message);
  } finally {
    rt.busy = false;
  }
}

export const useBotEngine = create<EngineState>((set, get) => ({
  sessions: [],
  logs: {},
  prices: {},

  setSessions: (sessions) => set({ sessions }),

  refresh: async () => {
    const { data } = await supabase
      .from("bot_sessions")
      .select("*")
      .order("created_at", { ascending: false });
    const sessions = (data ?? []) as unknown as BotSession[];
    set({ sessions });
    sessions.forEach((s) => {
      if (s.status === "running" || s.status === "waiting") get().attach(s);
    });
  },

  loadLogs: async (sessionId) => {
    const { data } = await supabase
      .from("bot_logs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(100);
    set({ logs: { ...get().logs, [sessionId]: (data ?? []) as unknown as BotLog[] } });
  },

  attach: (session) => {
    if (runtimes.has(session.id)) return;
    const rt: Runtime = { timer: null, unsubscribe: null, price: 0, trade: null, busy: false };
    runtimes.set(session.id, rt);

    void currentUserId().then((userId) => {
      if (!userId) return;
      rt.unsubscribe = subscribeTicker(session.symbol, (t) => {
        rt.price = t.price;
        const prices = useBotEngine.getState().prices;
        if (prices[session.symbol] !== t.price) {
          useBotEngine.setState({ prices: { ...prices, [session.symbol]: t.price } });
        }
        const live = useBotEngine.getState().sessions.find((s) => s.id === session.id);
        if (live?.status === "running" && rt.trade) manageOpenTrade(live, t.price, userId);
      });
      void runCheck(session, userId);
      rt.timer = setInterval(() => {
        const live = useBotEngine.getState().sessions.find((s) => s.id === session.id);
        if (!live || live.status !== "running") return;
        void runCheck(live, userId);
      }, Math.max(5, session.check_seconds) * 1000);
    });
  },

  detach: (sessionId) => {
    const rt = runtimes.get(sessionId);
    if (!rt) return;
    if (rt.timer) clearInterval(rt.timer);
    rt.unsubscribe?.();
    runtimes.delete(sessionId);
  },

  setStatus: async (sessionId, status) => {
    await supabase
      .from("bot_sessions")
      .update({
        status,
        ...(status === "running" ? { started_at: new Date().toISOString() } : {}),
        ...(status === "stopped" ? { stopped_at: new Date().toISOString() } : {}),
      })
      .eq("id", sessionId);
    set({ sessions: get().sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)) });

    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (status === "running") get().attach({ ...session, status });
    if (status === "stopped") {
      const rt = runtimes.get(sessionId);
      const userId = await currentUserId();
      if (rt?.trade && userId) await closeTrade(session, rt.price, "bot stopped", userId);
      get().detach(sessionId);
    }
  },

  remove: async (sessionId) => {
    get().detach(sessionId);
    await supabase.from("bot_sessions").delete().eq("id", sessionId);
    set({ sessions: get().sessions.filter((s) => s.id !== sessionId) });
  },
}));
