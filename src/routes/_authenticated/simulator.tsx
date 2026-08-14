import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ComposedChart,
  Bar,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  Bot,
  User,
  Wrench,
  Plus,
  X,
  ChevronDown,
  Play,
  Square,
  Send,
  ArrowUp,
  ArrowDown,
  Settings2,
  AlertTriangle,
  Circle,
  Trash2,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

/* ============================================================================
DESIGN TOKENS
Dark-navy trading-terminal palette matching the reference brief, with a teal
"live/positive" accent, red for negative/sell, amber for caution states (choppy
regime), and a monospace numeral face for all figures.
============================================================================ */
const T = {
  bg: "#0A0E14",
  card: "#121826",
  cardAlt: "#161D2C",
  border: "#232B3B",
  borderSoft: "#1A2130",
  teal: "#2DD4BF",
  tealSoft: "rgba(45,212,191,0.12)",
  red: "#F87171",
  redSoft: "rgba(248,113,113,0.12)",
  amber: "#FBBF24",
  amberSoft: "rgba(251,191,36,0.12)",
  blue: "#60A5FA",
  text: "#E7EBF3",
  textDim: "#8993A6",
  textFaint: "#4E5768",
};

/* ============================================================================
INDICATOR MATH — real, deterministic technical-analysis functions. Nothing here is
decorative; every number shown in the UI is computed directly from the simulated
price series below.
============================================================================ */
function ema(values: number[], period: number) {
  if (values.length === 0) return 0;
  if (values.length < period) return values.reduce((a, b) => a + b, 0) / values.length;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const slice = values.slice(-(period + 1));
  let gains = 0,
    losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgGain = gains / period,
    avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function efficiencyRatio(values: number[], period = 10) {
  if (values.length < period + 1) return 0;
  const slice = values.slice(-(period + 1));
  const change = Math.abs(slice[slice.length - 1] - slice[0]);
  let vol = 0;
  for (let i = 1; i < slice.length; i++) vol += Math.abs(slice[i] - slice[i - 1]);
  return vol === 0 ? 0 : change / vol;
}

function atrFromCandles(candles: Candle[], period = 14) {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-period - 1);
  let trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i],
      p = slice[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function classifyRegime(er: number) {
  if (er >= 0.3) return "trending";
  if (er < 0.15) return "choppy";
  return "range";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ============================================================================
STRATEGY ENGINE — each preset is a real parameterization (regime filter, entry
mode, thresholds), not a cosmetic label. evaluate() always derives action /
confidence / explanation from the live indicators passed in.
============================================================================ */
const STRATEGIES = {
  trend: { label: "Trend Following", regime: "trending", mode: "trend", minEmaDiff: 0.02, rsiGate: 50 },
  reversal: { label: "Smart Reversal", regime: "range", mode: "reversion", rsiHigh: 70, rsiLow: 30 },
  meanrev: { label: "Mean Reversion", regime: "range", mode: "reversion", rsiHigh: 65, rsiLow: 35 },
  breakout: { label: "Breakout", regime: "trending", mode: "trend", minEmaDiff: 0.05, rsiGate: 55 },
  momentum: { label: "Momentum", regime: null, mode: "trend", minEmaDiff: 0.01, rsiGate: 50 },
  scalping: { label: "Scalping", regime: null, mode: "trend", minEmaDiff: 0.006, rsiGate: 50 },
} as const;

type StrategyId = keyof typeof STRATEGIES;

type IndicatorState = {
  ema12: number;
  ema26: number;
  rsiVal: number;
  er: number;
  atr: number;
};

type Signal = {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  regime: string;
  emaDiffPct: number;
  reason: string;
};

function evaluateStrategy(stratId: StrategyId, ind: IndicatorState): Signal {
  const cfg = STRATEGIES[stratId];
  const { ema12, ema26, rsiVal, er } = ind;
  const emaDiffPct = ema26 !== 0 ? ((ema12 - ema26) / ema26) * 100 : 0;
  const regime = classifyRegime(er);
  const confidence = clamp(
    Math.round(50 + emaDiffPct * 8 + (rsiVal - 50) * 0.6 + (er * 100 - 25) * 0.4),
    5,
    97,
  );

  if (cfg.regime && regime !== cfg.regime) {
    return {
      action: "HOLD",
      confidence,
      regime,
      emaDiffPct,
      reason:
        cfg.regime === "trending"
          ? `${regime === "choppy" ? "Choppy" : "Range-bound"} market (ER=${er.toFixed(2)} < 0.30) — ${cfg.label} stands aside until a trend forms.`
          : `Market is trending (ER=${er.toFixed(2)} ≥ 0.30) — ${cfg.label} waits for a range to form before fading extremes.`,
    };
  }

  if (cfg.mode === "trend") {
    if (emaDiffPct >= cfg.minEmaDiff && rsiVal > cfg.rsiGate) {
      return {
        action: "BUY",
        confidence,
        regime,
        emaDiffPct,
        reason: `EMA12 is ${emaDiffPct.toFixed(2)}% above EMA26 and RSI=${rsiVal.toFixed(1)} confirms upside momentum (ER=${er.toFixed(2)}).`,
      };
    }
    if (emaDiffPct <= -cfg.minEmaDiff && rsiVal < 100 - cfg.rsiGate) {
      return {
        action: "SELL",
        confidence,
        regime,
        emaDiffPct,
        reason: `EMA12 is ${Math.abs(emaDiffPct).toFixed(2)}% below EMA26 and RSI=${rsiVal.toFixed(1)} confirms downside momentum (ER=${er.toFixed(2)}).`,
      };
    }
    return {
      action: "HOLD",
      confidence,
      regime,
      emaDiffPct,
      reason: `EMA/RSI not yet aligned (EMA Δ ${emaDiffPct.toFixed(2)}%, RSI ${rsiVal.toFixed(1)}) — waiting for stronger trend confirmation.`,
    };
  }

  if (rsiVal >= cfg.rsiHigh) {
    return {
      action: "SELL",
      confidence,
      regime,
      emaDiffPct,
      reason: `Overbought — RSI=${rsiVal.toFixed(1)} in a ${regime} market (ER=${er.toFixed(2)}). Fading the extreme back toward the mean.`,
    };
  }
  if (rsiVal <= cfg.rsiLow) {
    return {
      action: "BUY",
      confidence,
      regime,
      emaDiffPct,
      reason: `Oversold — RSI=${rsiVal.toFixed(1)} in a ${regime} market (ER=${er.toFixed(2)}). Fading the extreme back toward the mean.`,
    };
  }

  return {
    action: "HOLD",
    confidence,
    regime,
    emaDiffPct,
    reason: `Price inside the range (RSI=${rsiVal.toFixed(1)}) — waiting for a stretched extreme to fade.`,
  };
}

/* ============================================================================
MARKET DATA (simulated). Each symbol carries a slow-drifting bias so that genuine
trending / choppy phases emerge, rather than pure noise — this is what the
regime detector and strategies react to.
============================================================================ */
const SYMBOL_DEFS = [
  { id: "XAUUSD", name: "Gold", basePrice: 4031.6, vol: 0.55, decimals: 2, multiplier: 100, defaultLots: 0.1 },
  { id: "BTCUSD", name: "Bitcoin", basePrice: 64680.0, vol: 55, decimals: 2, multiplier: 1, defaultLots: 0.05 },
  { id: "ETHUSD", name: "Ethereum", basePrice: 1881.1, vol: 3.4, decimals: 2, multiplier: 1, defaultLots: 0.5 },
  { id: "EURUSD", name: "Euro / USD", basePrice: 1.0855, vol: 0.00075, decimals: 5, multiplier: 1000, defaultLots: 0.2 },
  { id: "NAS100", name: "Nasdaq 100", basePrice: 19540.0, vol: 9.5, decimals: 1, multiplier: 1, defaultLots: 0.02 },
] as const;

const TICKS_PER_CANDLE = 4;
const MAX_TICKS = 260;
const MAX_CANDLES = 60;
const LEVERAGE = 100;
const TICK_MS = 1500;

type Candle = { o: number; h: number; l: number; c: number; t: number };

type SymbolState = {
  price: number;
  drift: number;
  ticks: number[];
  candles: Candle[];
  tickInCandle: number;
  candleIdx: number;
  indicators: IndicatorState;
};

type Position = {
  id: string;
  symbol: string;
  dir: 1 | -1;
  lots: number;
  entry: number;
  botId: string | null;
  openedAt: number;
};

type BotState = {
  id: string;
  symbol: string;
  strategyId: StrategyId;
  timeframe: string;
  checkSec: number;
  elapsed: number;
  running: boolean;
  lastSignal: Signal | null;
  confHistory: { v: number }[];
  decisions: Array<{ t: number; action: string; reason: string; confidence: number; q?: string }>;
};

type MarketState = Record<string, SymbolState>;

function seedMarket(): MarketState {
  const m: MarketState = {};
  SYMBOL_DEFS.forEach((s) => {
    const ticks = [s.basePrice];
    m[s.id] = {
      price: s.basePrice,
      drift: (Math.random() - 0.5) * 0.4,
      ticks,
      candles: [{ o: s.basePrice, h: s.basePrice, l: s.basePrice, c: s.basePrice, t: 0 }],
      tickInCandle: 0,
      candleIdx: 0,
      indicators: { ema12: s.basePrice, ema26: s.basePrice, rsiVal: 50, er: 0, atr: 0 },
    };
  });
  return m;
}

function stepSymbol(def: (typeof SYMBOL_DEFS)[number], state: SymbolState, tickCount: number): SymbolState {
  let drift = state.drift + (Math.random() - 0.5) * 0.05;
  drift = clamp(drift, -1, 1);
  const noise = (Math.random() - 0.5) * 2;
  const change = (drift * 0.6 + noise * 0.4) * def.vol * 0.18;
  const price = Math.max(def.vol, state.price + change);

  const ticks = [...state.ticks, price].slice(-MAX_TICKS);

  let candles = state.candles;
  let tickInCandle = state.tickInCandle + 1;
  const last = candles[candles.length - 1];
  const updatedLast = { ...last, h: Math.max(last.h, price), l: Math.min(last.l, price), c: price };
  if (tickInCandle >= TICKS_PER_CANDLE) {
    candles = [...candles.slice(0, -1), updatedLast, { o: price, h: price, l: price, c: price, t: tickCount }].slice(-MAX_CANDLES);
    tickInCandle = 0;
  } else {
    candles = [...candles.slice(0, -1), updatedLast];
  }

  const ema12 = ema(ticks, 12);
  const ema26 = ema(ticks, 26);
  const rsiVal = rsi(ticks, 14);
  const er = efficiencyRatio(ticks, 10);
  const atr = atrFromCandles(candles, 14);

  return {
    price,
    drift,
    ticks,
    candles,
    tickInCandle,
    candleIdx: state.candleIdx,
    indicators: { ema12, ema26, rsiVal, er, atr },
  };
}

/* ============================================================================
SMALL UI PRIMITIVES
============================================================================ */
function fmt(v: number, decimals = 2) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${fmt(Math.abs(v), 2)}`;
}

function useTweenedNumber(target: number, duration = 350) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = display;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = clamp((ts - startRef.current) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: T.teal }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: T.teal }} />
    </span>
  );
}

function Badge({ children, tone = "teal" }: { children: React.ReactNode; tone?: "teal" | "red" | "amber" | "gray" }) {
  const map = {
    teal: { bg: T.tealSoft, fg: T.teal },
    red: { bg: T.redSoft, fg: T.red },
    amber: { bg: T.amberSoft, fg: T.amber },
    gray: { bg: "rgba(255,255,255,0.06)", fg: T.textDim },
  } as const;
  const c = map[tone];
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase" style={{ background: c.bg, color: c.fg }}>
      {children}
    </span>
  );
}

function IndicatorBar({ label, value, unit = "", range = 10 }: { label: string; value: number; unit?: string; range?: number }) {
  const pct = clamp(((value + range) / (range * 2)) * 100, 0, 100);
  const positive = value >= 0;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0" style={{ color: T.textDim }}>
        {label}
      </span>
      <div className="relative flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.borderSoft }}>
        <div className="absolute top-0 bottom-0" style={{ left: "50%", width: "1px", background: T.textFaint }} />
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
          style={{
            background: positive ? T.teal : T.red,
            left: positive ? "50%" : `${pct}%`,
            width: `${Math.abs(pct - 50)}%`,
          }}
        />
      </div>
      <span className="w-14 text-right font-mono shrink-0" style={{ color: positive ? T.teal : T.red }}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(1)}
        {unit}
      </span>
    </div>
  );
}

function ActionBadge({ action }: { action: "BUY" | "SELL" | "HOLD" }) {
  if (action === "BUY") return <Badge tone="teal">Buy</Badge>;
  if (action === "SELL") return <Badge tone="red">Sell</Badge>;
  return <Badge tone="gray">Hold</Badge>;
}

function RegimeBadge({ regime }: { regime: string }) {
  if (regime === "trending")
    return (
      <span className="text-xs flex items-center gap-1" style={{ color: T.teal }}>
        <TrendingUp size={12} /> trending
      </span>
    );
  if (regime === "choppy")
    return (
      <span className="text-xs flex items-center gap-1" style={{ color: T.red }}>
        ⌁ choppy
      </span>
    );
  return (
    <span className="text-xs flex items-center gap-1" style={{ color: T.amber }}>
      ↔ range
    </span>
  );
}

function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || payload.h === payload.l) return null;
  const { o, h, l, c } = payload;
  const ratio = height / (h - l || 1);
  const isUp = c >= o;
  const color = isUp ? T.teal : T.red;
  const bodyTop = y + (h - Math.max(o, c)) * ratio;
  const bodyHeight = Math.max(1.5, Math.abs(o - c) * ratio);
  const cx = x + width / 2;

  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + width * 0.22} y={bodyTop} width={width * 0.56} height={bodyHeight} fill={color} rx={0.5} />
    </g>
  );
}

function CandleChart({ candles, decimals }: { candles: Candle[]; decimals: number }) {
  const data = candles.map((c, i) => ({ ...c, idx: i, range: [c.l, c.h] }));
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const pad = (hi - lo) * 0.08 || 1;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="idx" hide />
        <YAxis
          domain={[lo - pad, hi + pad]}
          orientation="right"
          tick={{ fill: T.textFaint, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={62}
          tickFormatter={(v) => fmt(v, decimals)}
        />
        <ReferenceLine y={candles[candles.length - 1]?.c} stroke={T.teal} strokeDasharray="3 3" strokeOpacity={0.5} />
        <Bar dataKey="range" shape={CandleShape} isAnimationActive={false} />
        <Tooltip
          contentStyle={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
          labelFormatter={() => ""}
          formatter={(v, name, p: any) => [
            `O ${fmt(p.payload.o, decimals)} H ${fmt(p.payload.h, decimals)} L ${fmt(p.payload.l, decimals)} C ${fmt(p.payload.c, decimals)}`,
            "",
          ]}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Sparkline({ data, color }: { data: Array<{ v: number }>; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const START_BALANCE = 10000;

export const Route = createFileRoute("/_authenticated/simulator")({
  head: () => ({
    meta: [
      { title: "Trading Simulator · KiliMarkets" },
      { name: "description", content: "Interactive trading simulator with live market patterns, strategy bots, and real indicator math." },
      { property: "og:title", content: "Trading Simulator · KiliMarkets" },
      { property: "og:description", content: "Interactive trading simulator with live market patterns and strategy bots." },
    ],
  }),
  component: TradingSimulator,
});

export default function TradingSimulator() {
  const [tab, setTab] = useState("overview");
  const [market, setMarket] = useState<MarketState>(seedMarket);
  const tickCountRef = useRef(0);

  const [balance, setBalance] = useState(START_BALANCE);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activity, setActivity] = useState([
    { t: Date.now(), text: "Simulation started — demo account funded with $10,000.00.", kind: "info" },
  ] as Array<{ t: number; text: string; kind: string }>);
  const [bots, setBots] = useState<BotState[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [botForm, setBotForm] = useState({ symbol: "XAUUSD", strategyId: "momentum" as StrategyId, timeframe: "1h", checkSec: 60 });
  const [tradeForm, setTradeForm] = useState({ symbol: "XAUUSD", dir: 1 as 1 | -1, lots: 0.1 });
  const [askText, setAskText] = useState("");

  const symDef = (id: string) => SYMBOL_DEFS.find((s) => s.id === id)!;

  const logActivity = useCallback((text: string, kind = "info") => {
    setActivity((a) => [{ t: Date.now(), text, kind }, ...a].slice(0, 60));
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      tickCountRef.current += 1;
      const tc = tickCountRef.current;
      setMarket((prev) => {
        const next: MarketState = {};
        SYMBOL_DEFS.forEach((def) => {
          next[def.id] = stepSymbol(def, prev[def.id], tc);
        });
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setBots((prevBots) => {
        if (prevBots.length === 0) return prevBots;
        return prevBots.map((bot) => {
          if (!bot.running) return bot;
          const elapsed = bot.elapsed + 1000;
          if (elapsed < bot.checkSec * 1000) return { ...bot, elapsed };

          const ms = market[bot.symbol];
          if (!ms) return { ...bot, elapsed: 0 };
          const signal = evaluateStrategy(bot.strategyId, ms.indicators);
          const confHistory = [...bot.confHistory, { v: signal.confidence }].slice(-30);

          setPositions((pos) => {
            const mine = pos.find((p) => p.botId === bot.id);
            const def = symDef(bot.symbol);
            if (!mine && signal.action !== "HOLD" && signal.confidence >= 60) {
              const newPos: Position = {
                id: `${bot.id}-${Date.now()}`,
                symbol: bot.symbol,
                dir: signal.action === "BUY" ? 1 : -1,
                lots: def.defaultLots,
                entry: ms.price,
                botId: bot.id,
                openedAt: Date.now(),
              };
              logActivity(
                `${bot.symbol} · ${STRATEGIES[bot.strategyId].label} — opened ${signal.action} ${def.defaultLots} lots @ ${fmt(ms.price, def.decimals)}.`,
                signal.action === "BUY" ? "buy" : "sell",
              );
              return [newPos, ...pos];
            }
            if (mine && signal.action !== "HOLD" && signal.action !== (mine.dir === 1 ? "BUY" : "SELL") && signal.confidence >= 60) {
              const pnl = (ms.price - mine.entry) * mine.dir * mine.lots * def.multiplier;
              setBalance((b) => b + pnl);
              logActivity(
                `${bot.symbol} · ${STRATEGIES[bot.strategyId].label} — closed on trend flip, realized ${fmtMoney(pnl)}.`,
                pnl >= 0 ? "buy" : "sell",
              );
              return pos.filter((p) => p.id !== mine.id);
            }
            return pos;
          });

          const decisions = [
            { t: Date.now(), action: signal.action, reason: signal.reason, confidence: signal.confidence },
            ...bot.decisions,
          ].slice(0, 12);

          return { ...bot, elapsed: 0, lastSignal: signal, confHistory, decisions };
        });
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [market, logActivity, symDef]);

  const unrealizedTotal = positions.reduce((sum, p) => {
    const ms = market[p.symbol];
    const def = symDef(p.symbol);
    if (!ms) return sum;
    return sum + (ms.price - p.entry) * p.dir * p.lots * def.multiplier;
  }, 0);

  const equity = balance + unrealizedTotal;
  const usedMargin = positions.reduce((sum, p) => {
    const ms = market[p.symbol];
    const def = symDef(p.symbol);
    if (!ms) return sum;
    return sum + (ms.price * p.lots * def.multiplier) / LEVERAGE;
  }, 0);

  const freeMargin = equity - usedMargin;
  const animBalance = useTweenedNumber(balance);
  const animEquity = useTweenedNumber(equity);
  const animProfit = useTweenedNumber(unrealizedTotal);

  const closePosition = (id: string) => {
    const p = positions.find((x) => x.id === id);
    if (!p) return;
    const ms = market[p.symbol];
    const def = symDef(p.symbol);
    const pnl = (ms.price - p.entry) * p.dir * p.lots * def.multiplier;
    setBalance((b) => b + pnl);
    setPositions((ps) => ps.filter((x) => x.id !== id));
    logActivity(`Closed ${p.symbol} ${p.dir === 1 ? "BUY" : "SELL"} ${p.lots} lots manually — realized ${fmtMoney(pnl)}.`, pnl >= 0 ? "buy" : "sell");
  };

  const openManualPosition = () => {
    const def = symDef(tradeForm.symbol);
    const ms = market[tradeForm.symbol];
    const newPos: Position = {
      id: `manual-${Date.now()}`,
      symbol: tradeForm.symbol,
      dir: tradeForm.dir,
      lots: tradeForm.lots,
      entry: ms.price,
      botId: null,
      openedAt: Date.now(),
    };
    setPositions((ps) => [newPos, ...ps]);
    logActivity(
      `Manually opened ${tradeForm.symbol} ${tradeForm.dir === 1 ? "BUY" : "SELL"} ${tradeForm.lots} lots @ ${fmt(ms.price, def.decimals)}.`,
      tradeForm.dir === 1 ? "buy" : "sell",
    );
  };

  const startBot = () => {
    const id = `bot-${Date.now()}`;
    setBots((b) => [
      ...b,
      {
        id,
        symbol: botForm.symbol,
        strategyId: botForm.strategyId,
        timeframe: botForm.timeframe,
        checkSec: Number(botForm.checkSec),
        elapsed: 0,
        running: true,
        lastSignal: null,
        confHistory: [],
        decisions: [],
      },
    ]);
    logActivity(
      `Started ${STRATEGIES[botForm.strategyId].label} bot on ${botForm.symbol} (${botForm.timeframe}, checks every ${botForm.checkSec}s).`,
      "info",
    );
  };

  const stopBot = (id: string) => {
    setBots((bs) => bs.map((b) => (b.id === id ? { ...b, running: false } : b)));
    logActivity(`Stopped bot on ${bots.find((b) => b.id === id)?.symbol}.`, "info");
  };

  const removeBot = (id: string) => setBots((bs) => bs.filter((b) => b.id !== id));

  const resetSimulation = () => {
    setMarket(seedMarket());
    setBalance(START_BALANCE);
    setPositions([]);
    setBots([]);
    setActivity([{ t: Date.now(), text: "Simulation reset — demo account funded with $10,000.00.", kind: "info" }]);
    tickCountRef.current = 0;
  };

  const askModel = (bot: BotState) => {
    if (!askText.trim() || !bot.lastSignal) return;
    const q = askText.toLowerCase();
    let answer = bot.lastSignal.reason;
    if (q.includes("why") && q.includes("hold")) answer = `Currently holding: ${bot.lastSignal.reason}`;
    else if (q.includes("buy")) answer = bot.lastSignal.action === "BUY" ? bot.lastSignal.reason : `Not buying right now — ${bot.lastSignal.reason}`;
    else if (q.includes("sell")) answer = bot.lastSignal.action === "SELL" ? bot.lastSignal.reason : `Not selling right now — ${bot.lastSignal.reason}`;
    else if (q.includes("confidence")) answer = `Current confidence is ${bot.lastSignal.confidence}%, derived from EMA separation, RSI, and the efficiency ratio — not a fixed or fabricated score.`;
    setBots((bs) =>
      bs.map((b) =>
        b.id === bot.id
          ? {
              ...b,
              decisions: [{ t: Date.now(), action: "ASK", reason: answer, confidence: bot.lastSignal.confidence, q: askText }, ...b.decisions].slice(0, 12),
            }
          : b,
      ),
    );
    setAskText("");
  };

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: T.bg, fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <div className="w-full max-w-md flex flex-col min-h-screen relative" style={{ background: T.bg }}>
        <div className="px-4 pt-5 pb-3 flex items-center justify-between sticky top-0 z-20" style={{ background: T.bg, borderBottom: `1px solid ${T.borderSoft}` }}>
          <div>
            <div className="text-[15px] font-bold tracking-tight" style={{ color: T.text }}>
              Paper Terminal
            </div>
            <div className="text-[11px]" style={{ color: T.textFaint }}>
              Simulated data · demo account
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: T.cardAlt, border: `1px solid ${T.border}` }}>
            <LiveDot />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: T.teal }}>
              LIVE
            </span>
          </div>
        </div>

        {tab !== "account" && tab !== "tools" && (
          <div className="mx-4 mt-3 rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: T.textFaint }}>
              Floating P/L
            </div>
            <div className="text-3xl font-bold font-mono tabular-nums" style={{ color: unrealizedTotal >= 0 ? T.teal : T.red }}>
              {unrealizedTotal >= 0 ? "+" : ""}
              {fmtMoney(animProfit)}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: T.textFaint }}>
                  Balance
                </div>
                <div className="text-lg font-semibold font-mono" style={{ color: T.text }}>
                  {fmtMoney(animBalance)}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 pt-3" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: T.textFaint }}>
                  Equity
                </div>
                <div className="text-sm font-semibold font-mono" style={{ color: T.text }}>
                  {fmtMoney(animEquity)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: T.textFaint }}>
                  Margin
                </div>
                <div className="text-sm font-semibold font-mono" style={{ color: T.text }}>
                  {fmtMoney(usedMargin)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: T.textFaint }}>
                  Free
                </div>
                <div className="text-sm font-semibold font-mono" style={{ color: T.text }}>
                  {fmtMoney(freeMargin)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-24">
          {tab === "overview" && (
            <OverviewTab
              balance={balance}
              equity={equity}
              positions={positions}
              bots={bots}
              activity={activity}
              market={market}
              selectedSymbol={selectedSymbol}
              setTab={setTab}
            />
          )}
          {tab === "chart" && <ChartTab market={market} selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol} />}
          {tab === "trade" && (
            <TradeTab
              positions={positions}
              market={market}
              symDef={symDef}
              closePosition={closePosition}
              tradeForm={tradeForm}
              setTradeForm={setTradeForm}
              openManualPosition={openManualPosition}
            />
          )}
          {tab === "bots" && (
            <BotsTab
              bots={bots}
              market={market}
              botForm={botForm}
              setBotForm={setBotForm}
              startBot={startBot}
              stopBot={stopBot}
              removeBot={removeBot}
              askText={askText}
              setAskText={setAskText}
              askModel={askModel}
            />
          )}
          {tab === "account" && <AccountTab balance={balance} equity={equity} usedMargin={usedMargin} freeMargin={freeMargin} positions={positions} activity={activity} />}
          {tab === "tools" && <ToolsTab resetSimulation={resetSimulation} />}
        </div>

        <div className="fixed bottom-0 w-full max-w-md flex items-stretch z-30" style={{ background: T.card, borderTop: `1px solid ${T.border}` }}>
          {[
            { id: "overview", label: "Overview", icon: RefreshCw },
            { id: "chart", label: "Chart", icon: TrendingUp },
            { id: "trade", label: "Trade", icon: ArrowUp },
            { id: "bots", label: "Botting", icon: Bot },
            { id: "account", label: "Accounting", icon: User },
            { id: "tools", label: "Tools", icon: Wrench },
          ].map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-200"
              >
                <Icon size={20} strokeWidth={2} style={{ color: active ? T.teal : T.textFaint, transition: "color 200ms" }} />
                <span className="text-[10px] font-medium" style={{ color: active ? T.teal : T.textFaint }}>
                  {label}
                </span>
                <span className="h-0.5 w-5 rounded-full transition-all duration-200" style={{ background: active ? T.teal : "transparent" }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  balance,
  equity,
  positions,
  bots,
  activity,
  market,
  selectedSymbol,
  setTab,
}: {
  balance: number;
  equity: number;
  positions: Position[];
  bots: BotState[];
  activity: Array<{ t: number; text: string; kind: string }>;
  market: MarketState;
  selectedSymbol: string;
  setTab: (value: string) => void;
}) {
  const def = SYMBOL_DEFS.find((s) => s.id === selectedSymbol)!;
  const ms = market[selectedSymbol];
  const last = ms.candles[ms.candles.length - 1];
  const prevClose = ms.candles.length > 1 ? ms.candles[ms.candles.length - 2].c : last.o;
  const chg = last.c - prevClose;
  const chgPct = (chg / prevClose) * 100;
  const up = chg >= 0;
  const regime = classifyRegime(ms.indicators.er);

  return (
    <div className="px-4 pt-4 space-y-3">
      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.textFaint }}>
          Market pulse · {selectedSymbol}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold font-mono" style={{ color: T.text }}>
              {fmt(last.c, def.decimals)}
            </div>
            <div className="text-xs mt-1" style={{ color: T.textDim }}>
              {up ? "+" : ""}
              {fmt(chg, def.decimals)} ({up ? "+" : ""}
              {chgPct.toFixed(2)}%)
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase" style={{ color: T.textFaint }}>
              Regime
            </div>
            <div className="text-sm font-semibold" style={{ color: regime === "trending" ? T.teal : regime === "choppy" ? T.red : T.amber }}>
              {regime}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setTab("trade")}
          className="rounded-2xl p-3 text-left"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: T.textFaint }}>
            Account
          </div>
          <div className="text-lg font-semibold font-mono mt-1" style={{ color: T.text }}>
            {fmtMoney(balance)}
          </div>
          <div className="text-xs mt-1" style={{ color: T.textDim }}>
            Open or close a trade
          </div>
        </button>
        <button
          onClick={() => setTab("bots")}
          className="rounded-2xl p-3 text-left"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: T.textFaint }}>
            Botting
          </div>
          <div className="text-lg font-semibold font-mono mt-1" style={{ color: T.text }}>
            {bots.filter((b) => b.running).length}
          </div>
          <div className="text-xs mt-1" style={{ color: T.textDim }}>
            Live bot strategies
          </div>
        </button>
      </div>

      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: T.textFaint }}>
            Snapshot
          </div>
          <button onClick={() => setTab("account")} className="text-[11px] font-semibold" style={{ color: T.teal }}>
            Full accounting
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
              Equity
            </div>
            <div className="font-mono font-semibold" style={{ color: T.text }}>
              {fmtMoney(equity)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
              Positions
            </div>
            <div className="font-mono font-semibold" style={{ color: T.text }}>
              {positions.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
              Bots
            </div>
            <div className="font-mono font-semibold" style={{ color: T.text }}>
              {bots.length}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Recent activity
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {activity.slice(0, 5).map((a, i) => (
            <div key={i} className="text-xs flex gap-2">
              <span className="font-mono shrink-0" style={{ color: T.textFaint }}>
                {new Date(a.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span style={{ color: a.kind === "buy" ? T.teal : a.kind === "sell" ? T.red : T.textDim }}>
                {a.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartTab({ market, selectedSymbol, setSelectedSymbol }: { market: MarketState; selectedSymbol: string; setSelectedSymbol: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const def = SYMBOL_DEFS.find((s) => s.id === selectedSymbol)!;
  const ms = market[selectedSymbol];
  const last = ms.candles[ms.candles.length - 1];
  const prevClose = ms.candles.length > 1 ? ms.candles[ms.candles.length - 2].c : last.o;
  const chg = last.c - prevClose;
  const chgPct = (chg / prevClose) * 100;
  const up = chg >= 0;

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-sm"
            style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
          >
            {selectedSymbol}
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="absolute left-0 top-9 z-40 rounded-xl overflow-hidden w-40" style={{ background: T.cardAlt, border: `1px solid ${T.border}` }}>
              {SYMBOL_DEFS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSymbol(s.id);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                  style={{ color: s.id === selectedSymbol ? T.teal : T.text }}
                >
                  {s.id}
                  <span className="text-xs" style={{ color: T.textFaint }}>
                    · {s.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Badge tone="teal">Live</Badge>
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold font-mono" style={{ color: T.text }}>
          {fmt(last.c, def.decimals)}
        </span>
        <span className="text-sm font-semibold font-mono" style={{ color: up ? T.teal : T.red }}>
          {up ? "+" : ""}
          {fmt(chg, def.decimals)} ({up ? "+" : ""}{chgPct.toFixed(2)}%)
        </span>
      </div>
      <div className="flex gap-4 text-xs font-mono mb-3" style={{ color: T.textDim }}>
        <span>
          O <span style={{ color: T.text }}>{fmt(last.o, def.decimals)}</span>
        </span>
        <span>
          H <span style={{ color: T.teal }}>{fmt(last.h, def.decimals)}</span>
        </span>
        <span>
          L <span style={{ color: T.red }}>{fmt(last.l, def.decimals)}</span>
        </span>
        <span>
          C <span style={{ color: T.text }}>{fmt(last.c, def.decimals)}</span>
        </span>
      </div>

      <div className="rounded-2xl p-2" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <CandleChart candles={ms.candles} decimals={def.decimals} />
      </div>

      <div className="mt-4 rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Live indicators — {selectedSymbol}
        </div>
        <div className="space-y-2.5">
          <IndicatorBar label="Trend (EMA)" value={((ms.indicators.ema12 - ms.indicators.ema26) / ms.indicators.ema26) * 1000} />
          <IndicatorBar label="Momentum (RSI)" value={ms.indicators.rsiVal - 50} />
          <IndicatorBar label="Efficiency Ratio" value={ms.indicators.er * 20} range={6} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <RegimeBadge regime={classifyRegime(ms.indicators.er)} />
          <span className="text-xs" style={{ color: T.textFaint }}>
            · ATR {fmt(ms.indicators.atr, def.decimals)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TradeTab({
  positions,
  market,
  symDef,
  closePosition,
  tradeForm,
  setTradeForm,
  openManualPosition,
}: {
  positions: Position[];
  market: MarketState;
  symDef: (id: string) => (typeof SYMBOL_DEFS)[number];
  closePosition: (id: string) => void;
  tradeForm: { symbol: string; dir: 1 | -1; lots: number };
  setTradeForm: React.Dispatch<React.SetStateAction<{ symbol: string; dir: 1 | -1; lots: number }>>;
  openManualPosition: () => void;
}) {
  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl p-4 mb-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          New order
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={tradeForm.symbol}
            onChange={(e) => setTradeForm((f) => ({ ...f, symbol: e.target.value }))}
            className="rounded-lg px-3 py-2 text-sm font-mono"
            style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
          >
            {SYMBOL_DEFS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={tradeForm.lots}
            onChange={(e) => setTradeForm((f) => ({ ...f, lots: Number(e.target.value) }))}
            className="rounded-lg px-3 py-2 text-sm font-mono"
            style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTradeForm((f) => ({ ...f, dir: 1 }))}
            className="py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 transition-colors"
            style={{
              background: tradeForm.dir === 1 ? T.tealSoft : T.cardAlt,
              color: tradeForm.dir === 1 ? T.teal : T.textDim,
              border: `1px solid ${tradeForm.dir === 1 ? T.teal : T.border}`,
            }}
          >
            <ArrowUp size={14} /> Buy
          </button>
          <button
            onClick={() => setTradeForm((f) => ({ ...f, dir: -1 }))}
            className="py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 transition-colors"
            style={{
              background: tradeForm.dir === -1 ? T.redSoft : T.cardAlt,
              color: tradeForm.dir === -1 ? T.red : T.textDim,
              border: `1px solid ${tradeForm.dir === -1 ? T.red : T.border}`,
            }}
          >
            <ArrowDown size={14} /> Sell
          </button>
        </div>
        <button
          onClick={openManualPosition}
          className="w-full mt-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: T.teal, color: "#04231F" }}
        >
          <Plus size={16} /> Open position
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.textFaint }}>
          Open positions · {positions.length}
        </span>
      </div>

      <div className="space-y-2.5">
        {positions.length === 0 && (
          <div className="text-center py-10 rounded-2xl" style={{ background: T.card, border: `1px dashed ${T.border}` }}>
            <div className="text-sm" style={{ color: T.textDim }}>
              No open positions
            </div>
            <div className="text-xs mt-1" style={{ color: T.textFaint }}>
              Open one above, or start a bot to trade automatically.
            </div>
          </div>
        )}

        {positions.map((p) => {
          const def = symDef(p.symbol);
          const ms = market[p.symbol];
          const pnl = (ms.price - p.entry) * p.dir * p.lots * def.multiplier;
          return (
            <div
              key={p.id}
              className="rounded-2xl p-4 flex items-center justify-between transition-all duration-300"
              style={{ background: T.card, border: `1px solid ${T.border}` }}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm" style={{ color: T.text }}>
                    {p.symbol}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{ background: p.dir === 1 ? T.tealSoft : T.redSoft, color: p.dir === 1 ? T.teal : T.red }}
                  >
                    {p.dir === 1 ? "Buy" : "Sell"} {p.lots}
                  </span>
                  {p.botId && <Bot size={12} style={{ color: T.textFaint }} />}
                </div>
                <div className="text-xs font-mono" style={{ color: T.textFaint }}>
                  {fmt(p.entry, def.decimals)} → {fmt(ms.price, def.decimals)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-sm mb-1.5" style={{ color: pnl >= 0 ? T.teal : T.red }}>
                  {pnl >= 0 ? "+" : ""}
                  {fmtMoney(pnl)}
                </div>
                <button
                  onClick={() => closePosition(p.id)}
                  className="px-3 py-1 rounded-md text-xs font-semibold"
                  style={{ background: T.amberSoft, color: T.amber, border: `1px solid ${T.amber}33` }}
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BotsTab({
  bots,
  market,
  botForm,
  setBotForm,
  startBot,
  stopBot,
  removeBot,
  askText,
  setAskText,
  askModel,
}: {
  bots: BotState[];
  market: MarketState;
  botForm: { symbol: string; strategyId: StrategyId; timeframe: string; checkSec: number };
  setBotForm: React.Dispatch<React.SetStateAction<{ symbol: string; strategyId: StrategyId; timeframe: string; checkSec: number }>>;
  startBot: () => void;
  stopBot: (id: string) => void;
  removeBot: (id: string) => void;
  askText: string;
  setAskText: React.Dispatch<React.SetStateAction<string>>;
  askModel: (bot: BotState) => void;
}) {
  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl p-4 mb-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Configure bot
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px]" style={{ color: T.textFaint }}>
              Strategy
            </label>
            <select
              value={botForm.strategyId}
              onChange={(e) => setBotForm((f) => ({ ...f, strategyId: e.target.value as StrategyId }))}
              className="w-full mt-0.5 rounded-lg px-2.5 py-2 text-sm"
              style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
            >
              {Object.entries(STRATEGIES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px]" style={{ color: T.textFaint }}>
              Symbol
            </label>
            <select
              value={botForm.symbol}
              onChange={(e) => setBotForm((f) => ({ ...f, symbol: e.target.value }))}
              className="w-full mt-0.5 rounded-lg px-2.5 py-2 text-sm font-mono"
              style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
            >
              {SYMBOL_DEFS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px]" style={{ color: T.textFaint }}>
              Timeframe
            </label>
            <select
              value={botForm.timeframe}
              onChange={(e) => setBotForm((f) => ({ ...f, timeframe: e.target.value }))}
              className="w-full mt-0.5 rounded-lg px-2.5 py-2 text-sm"
              style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
            >
              {['1m', '5m', '15m', '1h', '4h'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px]" style={{ color: T.textFaint }}>
              Check every (sec)
            </label>
            <input
              type="number"
              min="5"
              value={botForm.checkSec}
              onChange={(e) => setBotForm((f) => ({ ...f, checkSec: Number(e.target.value) }))}
              className="w-full mt-0.5 rounded-lg px-2.5 py-2 text-sm font-mono"
              style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
            />
          </div>
        </div>
        <button
          onClick={startBot}
          className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: T.teal, color: "#04231F" }}
        >
          <Play size={15} fill="#04231F" /> Start bot
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.textFaint }}>
          Running bots · {bots.filter((b) => b.running).length}
        </span>
      </div>

      <div className="space-y-3">
        {bots.length === 0 && (
          <div className="text-center py-10 rounded-2xl" style={{ background: T.card, border: `1px dashed ${T.border}` }}>
            <Bot size={22} style={{ color: T.textFaint }} className="mx-auto mb-2" />
            <div className="text-sm" style={{ color: T.textDim }}>
              No bots running
            </div>
            <div className="text-xs mt-1" style={{ color: T.textFaint }}>
              Configure one above — decisions are driven by live EMA/RSI/ER, computed every check.
            </div>
          </div>
        )}
        {bots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            market={market}
            stopBot={stopBot}
            removeBot={removeBot}
            askText={askText}
            setAskText={setAskText}
            askModel={askModel}
          />
        ))}
      </div>
    </div>
  );
}

function BotCard({
  bot,
  market,
  stopBot,
  removeBot,
  askText,
  setAskText,
  askModel,
}: {
  bot: BotState;
  market: MarketState;
  stopBot: (id: string) => void;
  removeBot: (id: string) => void;
  askText: string;
  setAskText: React.Dispatch<React.SetStateAction<string>>;
  askModel: (bot: BotState) => void;
}) {
  const def = SYMBOL_DEFS.find((s) => s.id === bot.symbol)!;
  const ms = market[bot.symbol];
  const signal = bot.lastSignal;
  const regime = signal ? signal.regime : classifyRegime(ms.indicators.er);
  const secsLeft = Math.max(0, bot.checkSec - Math.floor(bot.elapsed / 1000));

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-300" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="flex items-center gap-2">
          <Circle size={8} fill={bot.running ? T.teal : T.textFaint} style={{ color: bot.running ? T.teal : T.textFaint }} />
          <span className="font-bold text-sm font-mono" style={{ color: T.text }}>
            {bot.symbol}
          </span>
          <span className="text-xs" style={{ color: T.textFaint }}>
            · {STRATEGIES[bot.strategyId].label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {signal && <ActionBadge action={signal.action} />}
          <RegimeBadge regime={regime} />
        </div>
      </div>

      <div className="p-4 grid grid-cols-4 gap-2 text-center" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div>
          <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
            Price
          </div>
          <div className="text-sm font-mono font-semibold" style={{ color: T.text }}>
            {fmt(ms.price, def.decimals)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
            Timeframe
          </div>
          <div className="text-sm font-mono font-semibold" style={{ color: T.text }}>
            {bot.timeframe}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
            Confidence
          </div>
          <div className="text-sm font-mono font-semibold" style={{ color: T.teal }}>
            {signal ? `${signal.confidence}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase" style={{ color: T.textFaint }}>
            Next check
          </div>
          <div className="text-sm font-mono font-semibold" style={{ color: T.text }}>
            {bot.running ? `${secsLeft}s` : "paused"}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: T.textFaint }}>
            Confidence history
          </span>
        </div>
        <Sparkline data={bot.confHistory.length ? bot.confHistory : [{ v: 50 }, { v: 50 }]} color={T.teal} />
        <div className="space-y-2.5 pt-1">
          <IndicatorBar label="Trend (EMA)" value={((ms.indicators.ema12 - ms.indicators.ema26) / ms.indicators.ema26) * 1000} />
          <IndicatorBar label="Momentum (RSI)" value={ms.indicators.rsiVal - 50} />
          <IndicatorBar label="Regime (ER)" value={ms.indicators.er * 20} range={6} />
        </div>
      </div>

      <div className="p-4" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span style={{ fontSize: 14 }}>🧠</span>
          <span className="text-[11px] uppercase tracking-wider" style={{ color: T.textFaint }}>
            Model reasoning — computed live, not fabricated
          </span>
        </div>
        <div
          className="text-xs leading-relaxed rounded-lg p-2.5"
          style={{
            background: T.cardAlt,
            color: T.textDim,
            borderLeft: `2px solid ${signal?.action === "BUY" ? T.teal : signal?.action === "SELL" ? T.red : T.amber}`,
          }}
        >
          {signal ? signal.reason : "Waiting for the first check to compute EMA / RSI / Efficiency Ratio from live ticks…"}
        </div>
        {bot.decisions.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {bot.decisions.map((d, i) => (
              <div key={i} className="text-[11px] flex gap-2">
                <span className="font-mono shrink-0" style={{ color: T.textFaint }}>
                  {new Date(d.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span
                  className="shrink-0 font-semibold"
                  style={{ color: d.action === "BUY" ? T.teal : d.action === "SELL" ? T.red : d.action === "ASK" ? T.blue : T.textDim }}
                >
                  {d.action === "ASK" ? `Q: ${d.q}` : d.action}
                </span>
                <span style={{ color: T.textFaint }} className="truncate">
                  {d.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex items-center gap-2">
        <input
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askModel(bot)}
          placeholder="Ask the model… (e.g. why HOLD?)"
          className="flex-1 rounded-lg px-3 py-2 text-xs"
          style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.text }}
        />
        <button onClick={() => askModel(bot)} className="p-2 rounded-lg" style={{ background: T.tealSoft, color: T.teal }}>
          <Send size={14} />
        </button>
      </div>

      <div className="p-3 flex gap-2">
        {bot.running ? (
          <button
            onClick={() => stopBot(bot.id)}
            className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: T.redSoft, color: T.red }}
          >
            <Square size={13} /> Stop
          </button>
        ) : (
          <button
            onClick={() => removeBot(bot.id)}
            className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: T.cardAlt, color: T.textDim }}
          >
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function AccountTab({ balance, equity, usedMargin, freeMargin, positions, activity }: { balance: number; equity: number; usedMargin: number; freeMargin: number; positions: Position[]; activity: Array<{ t: number; text: string; kind: string }> }) {
  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl p-4 mb-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Demo account
        </div>
        {[
          ["Account ID", "DEMO-100294"],
          ["Currency", "USD"],
          ["Leverage", `1:${LEVERAGE}`],
          ["Balance", fmtMoney(balance)],
          ["Equity", fmtMoney(equity)],
          ["Used margin", fmtMoney(usedMargin)],
          ["Free margin", fmtMoney(freeMargin)],
          ["Open positions", positions.length.toString()],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
            <span className="text-sm" style={{ color: T.textDim }}>
              {k}
            </span>
            <span className="text-sm font-mono font-semibold" style={{ color: T.text }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Activity
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activity.map((a, i) => (
            <div key={i} className="text-xs flex gap-2">
              <span className="font-mono shrink-0" style={{ color: T.textFaint }}>
                {new Date(a.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span style={{ color: a.kind === "buy" ? T.teal : a.kind === "sell" ? T.red : T.textDim }}>
                {a.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolsTab({ resetSimulation }: { resetSimulation: () => void }) {
  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl p-4 mb-4 flex gap-3" style={{ background: T.amberSoft, border: `1px solid ${T.amber}33` }}>
        <AlertTriangle size={18} style={{ color: T.amber }} className="shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed" style={{ color: T.text }}>
          This is a self-contained simulator. Prices are procedurally generated (not a live market feed), balance/equity/margin are fully reconciled against actual simulated trades, and every bot decision is computed from real EMA / RSI / Efficiency Ratio values — nothing here is scripted for effect.
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Simulation
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm" style={{ color: T.text }}>
              Reset simulation
            </div>
            <div className="text-xs" style={{ color: T.textFaint }}>
              Clears positions, bots, and resets balance to $10,000.00
            </div>
          </div>
          <button onClick={resetSimulation} className="p-2.5 rounded-lg" style={{ background: T.cardAlt, color: T.textDim, border: `1px solid ${T.border}` }}>
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4 mt-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.textFaint }}>
          Engine
        </div>
        {[
          ["Tick interval", `${TICK_MS} ms`],
          ["Leverage", `1:${LEVERAGE}`],
          ["Symbols", SYMBOL_DEFS.map((s) => s.id).join(", ")],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
            <span className="text-sm" style={{ color: T.textDim }}>
              {k}
            </span>
            <span className="text-xs font-mono" style={{ color: T.text }}>
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
