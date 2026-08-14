import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { getLocalUserMeta, isLocalMode, isSupabaseConfigured, supabase, writeLocalUserMeta } from "@/integrations/supabase/client";
import { getPaymentAddress } from "@/lib/payment-wallets";
import { SYMBOLS, getSymbolSpec } from "@/lib/market/symbols";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Circle,
  ChevronDown,
  ChevronUp,
  Info,
  Play,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  TrendingUp,
  User,
  Wrench,
  X,
} from "lucide-react";

type TabKey = "chart" | "botting" | "accounting" | "tools";
type PaymentAction = "subscribe" | "topup" | "withdraw";

type Candle = { o: number; h: number; l: number; c: number; t: number };

type IndicatorState = { ema12: number; ema26: number; rsiVal: number; er: number; atr: number };

type Signal = { action: "BUY" | "SELL" | "HOLD"; confidence: number; regime: string; emaDiffPct: number; reason: string };

type DemoOutcomeMode = "normal" | "profit" | "loss";
type Position = { id: string; symbol: string; dir: 1 | -1; lots: number; entry: number; botId: string | null; openedAt: number; dbId?: string | null; outcomeMode?: DemoOutcomeMode };

type BotModel = {
  id: string;
  symbol: string;
  strategyId: StrategyId;
  timeframe: string;
  checkSec: number;
  elapsed: number;
  running: boolean;
  lastSignal: Signal | null;
  confHistory: Array<{ v: number }>;
  decisions: Array<{ t: number; action: string; reason: string; confidence: number; q?: string }>;
};

type ActivityItem = { t: number; text: string; kind: "info" | "buy" | "sell" };

type RequestType = "subscription" | "topup" | "withdraw";

type PendingRequest = {
  id: string;
  type: RequestType;
  title: string;
  amount?: number;
  status: string;
  network?: string;
  address?: string;
  userEmail?: string;
  createdAt: number;
};

type SymbolDef = { id: string; name: string; basePrice: number; vol: number; decimals: number; multiplier: number; defaultLots: number };

type MarketState = Record<string, { price: number; drift: number; ticks: number[]; candles: Candle[]; tickInCandle: number; indicators: IndicatorState }>;

type StrategyConfig = {
  label: string;
  regime: "trending" | "range" | null;
  mode: "trend" | "reversion";
  minEmaDiff?: number;
  rsiGate?: number;
  rsiHigh?: number;
  rsiLow?: number;
  description: string;
  details: {
    overview: string;
    bestFor: string;
    timeframe: string;
    howItTrades: string;
    howToRun: string[];
    whatToExpect: string;
  };
};

const T = {
  bg: "var(--background)",
  card: "var(--card)",
  cardAlt: "var(--surface)",
  border: "var(--border)",
  borderSoft: "var(--border)",
  teal: "#2DD4BF",
  tealSoft: "rgba(45,212,191,0.12)",
  red: "#F87171",
  redSoft: "rgba(248,113,113,0.12)",
  amber: "#FBBF24",
  amberSoft: "rgba(251,191,36,0.12)",
  blue: "#60A5FA",
  text: "var(--foreground)",
  textDim: "var(--muted-foreground)",
  textFaint: "var(--muted-foreground)",
};

const SYMBOL_DEFS: SymbolDef[] = [
  { id: "XAUUSD", name: "Gold", basePrice: 4031.6, vol: 0.55, decimals: 2, multiplier: 100, defaultLots: 0.1 },
  { id: "BTCUSD", name: "Bitcoin", basePrice: 64680, vol: 55, decimals: 2, multiplier: 1, defaultLots: 0.05 },
  { id: "ETHUSD", name: "Ethereum", basePrice: 1881.1, vol: 3.4, decimals: 2, multiplier: 1, defaultLots: 0.5 },
  { id: "EURUSD", name: "Euro / USD", basePrice: 1.0855, vol: 0.00075, decimals: 5, multiplier: 1000, defaultLots: 0.2 },
  { id: "NAS100", name: "Nasdaq 100", basePrice: 19540, vol: 9.5, decimals: 1, multiplier: 1, defaultLots: 0.02 },
  { id: "SOLUSD", name: "Solana", basePrice: 172.4, vol: 1.8, decimals: 2, multiplier: 1, defaultLots: 0.5 },
  { id: "BNBUSD", name: "BNB", basePrice: 586.2, vol: 4.2, decimals: 2, multiplier: 1, defaultLots: 0.2 },
  { id: "XRPUSD", name: "XRP", basePrice: 0.524, vol: 0.008, decimals: 4, multiplier: 1, defaultLots: 100 },
  { id: "DOGEUSD", name: "Dogecoin", basePrice: 0.142, vol: 0.003, decimals: 5, multiplier: 1, defaultLots: 500 },
  { id: "LTCUSD", name: "Litecoin", basePrice: 72.8, vol: 0.9, decimals: 2, multiplier: 1, defaultLots: 1 },
  { id: "GBPUSD", name: "British Pound / USD", basePrice: 1.2712, vol: 0.0008, decimals: 5, multiplier: 1000, defaultLots: 0.2 },
  { id: "USDJPY", name: "USD / Japanese Yen", basePrice: 156.42, vol: 0.11, decimals: 2, multiplier: 100, defaultLots: 0.2 },
  { id: "XAGUSD", name: "Silver", basePrice: 31.42, vol: 0.12, decimals: 3, multiplier: 5000, defaultLots: 0.01 },
  { id: "WTIUSD", name: "WTI Crude Oil", basePrice: 78.35, vol: 0.24, decimals: 2, multiplier: 1000, defaultLots: 0.01 },
  { id: "BRENTUSD", name: "Brent Crude Oil", basePrice: 82.1, vol: 0.22, decimals: 2, multiplier: 1000, defaultLots: 0.01 },
  { id: "NATGASUSD", name: "Natural Gas", basePrice: 2.74, vol: 0.025, decimals: 3, multiplier: 10000, defaultLots: 0.01 },
  { id: "SPX500", name: "S&P 500", basePrice: 5320, vol: 4.5, decimals: 1, multiplier: 1, defaultLots: 0.02 },
];

const STRATEGIES = {
  trend: {
    label: "Trend Following",
    regime: "trending",
    mode: "trend",
    minEmaDiff: 0.02,
    rsiGate: 50,
    description: "Trend-following strategy that enters with EMA momentum and RSI confirmation.",
    details: {
      overview: "Classic trend strategy built around EMA momentum and RSI support.",
      bestFor: "Trending crypto and gold.",
      timeframe: "15m to 1h.",
      howItTrades: "Buys when EMA12 moves above EMA26 in a trending market and sells when the reverse setup appears, with RSI confirming momentum.",
      howToRun: ["Pick 'Trend Following' in the Bot setup.", "Select a trending symbol like BTCUSD or XAUUSD.", "Use a 15m or 1h timeframe.", "Keep defaults and tap Start."],
      whatToExpect: "Moderate trade frequency with performance that improves in clean trends and weakens in choppy ranges.",
    },
  },
  reversal: {
    label: "Smart Reversal",
    regime: "range",
    mode: "reversion",
    rsiHigh: 70,
    rsiLow: 30,
    description: "Range-based reversal strategy that fades price extremes and waits for mean reversion.",
    details: {
      overview: "Smart reversal strategy designed for sideways markets with defined support and resistance.",
      bestFor: "Range-bound FX and crypto pairs.",
      timeframe: "1h to 4h.",
      howItTrades: "Sells when RSI is high and buys when RSI is low inside a range, using the market regime to avoid trending breakouts.",
      howToRun: ["Pick 'Smart Reversal' in the Bot setup.", "Choose a symbol with range behavior.", "Use 1h or 4h for clearer swings.", "Leave defaults and tap Start."],
      whatToExpect: "Lower frequency but more disciplined entries once the market is range-bound.",
    },
  },
  meanrev: {
    label: "Mean Reversion",
    regime: "range",
    mode: "reversion",
    rsiHigh: 65,
    rsiLow: 35,
    description: "Mean-reversion approach that buys oversold dips and sells overbought rallies.",
    details: {
      overview: "A classic mean reversion system tuned for range conditions.",
      bestFor: "Sideways altcoins and non-trending assets.",
      timeframe: "15m to 1h.",
      howItTrades: "Enters long on RSI oversold readings and short on RSI overbought readings, expecting price to return to the mean.",
      howToRun: ["Pick 'Mean Reversion' in the Bot setup.", "Select a symbol with stable oscillation.", "Use 15m or 1h timeframe.", "Start with defaults."],
      whatToExpect: "Steady, range-based entries that can struggle during strong trends.",
    },
  },
  breakout: {
    label: "Breakout",
    regime: "trending",
    mode: "trend",
    minEmaDiff: 0.05,
    rsiGate: 55,
    description: "Breakout strategy that chases stronger trending moves after momentum builds.",
    details: {
      overview: "A breakout system that commits only when momentum is strong enough.",
      bestFor: "Strong trending assets and breakout setups.",
      timeframe: "15m to 1h.",
      howItTrades: "Enters long when the fast EMA is well above the slow EMA and RSI confirms strength, with the opposite setup used for shorts.",
      howToRun: ["Pick 'Breakout' in the Bot setup.", "Choose a symbol showing range compression or a new trend.", "Use 15m or 1h.", "Tap Start and monitor momentum."],
      whatToExpect: "Lower trade frequency, fewer but stronger trend entries.",
    },
  },
  momentum: {
    label: "Momentum",
    regime: null,
    mode: "trend",
    minEmaDiff: 0.01,
    rsiGate: 50,
    description: "Momentum strategy that follows price strength with moderate EMA/RSI thresholds.",
    details: {
      overview: "A flexible momentum approach that works across regimes.",
      bestFor: "Assets with consistent directional strength.",
      timeframe: "5m to 1h.",
      howItTrades: "Buys when the fast EMA is above the slow EMA and RSI is favorable, and sells on the reverse weakness signal.",
      howToRun: ["Pick 'Momentum' in the Bot setup.", "Select a strong trend symbol.", "Choose 5m to 1h timeframe.", "Tap Start and let it ride momentum."],
      whatToExpect: "Regular trend-based trades; can stay in positions longer than scalping.",
    },
  },
  scalping: {
    label: "Scalping Daily Trade",
    regime: null,
    mode: "trend",
    minEmaDiff: 0.006,
    rsiGate: 50,
    description: "Fast intraday strategy tuned for daily trade setups and quick trend entries.",
    details: {
      overview: "A compact daily trading strategy designed for quick intraday moves.",
      bestFor: "High-liquidity crypto and gold during active sessions.",
      timeframe: "1m to 15m.",
      howItTrades: "Enters when the fast EMA crosses the slow EMA with RSI support, then exits quickly on the reverse signal or target.",
      howToRun: ["Pick 'Scalping Daily Trade' in the Bot setup.", "Choose a liquid symbol.", "Use 1m or 15m timeframe.", "Start with defaults and monitor closely."],
      whatToExpect: "Higher trade cadence with smaller targets and quicker exits.",
    },
  },
  ma_crossover: {
    label: "MA Crossover",
    regime: "trending",
    mode: "trend",
    minEmaDiff: 0.015,
    rsiGate: 52,
    description: "MA crossover strategy that enters when fast and slow EMAs separate in a trend.",
    details: {
      overview: "Classic dual moving-average system — the reference strategy.",
      bestFor: "Trending crypto and gold.",
      timeframe: "15m to 1h.",
      howItTrades: "Goes long when the fast EMA crosses above the slow EMA and short on the opposite cross, with the trend EMA acting as a directional gate. Exits on the reverse cross, the hard stop, or the take-profit target.",
      howToRun: ["Pick 'MA Crossover' in the Bots tab.", "Set Symbol and Timeframe (15m is a good start).", "Leave defaults and tap Start."],
      whatToExpect: "Steady trade frequency. Performs poorly in tight ranges, strongly in clean trends.",
    },
  },
  lumia_ai: {
    label: "Lumia AI",
    regime: null,
    mode: "trend",
    minEmaDiff: 0.014,
    rsiGate: 51,
    description: "Adaptive trend strategy using subtle EMA and RSI thresholds for smoother entries.",
    details: {
      overview: "An adaptive trend strategy that leans into momentum without being overly aggressive.",
      bestFor: "Mixed market conditions and trending crypto.",
      timeframe: "15m to 1h.",
      howItTrades: "Looks for EMA separation plus mild RSI confirmation, aiming for smoother trend entries and fewer whipsaws.",
      howToRun: ["Pick 'Lumia AI' in the Bots tab.", "Select a liquid asset.", "Use 15m or 1h timeframe.", "Tap Start with default settings."],
      whatToExpect: "Balanced trend entries with lower noise sensitivity than raw momentum setups.",
    },
  },
  dijja8_smart_reversal: {
    label: "Dijja8 Smart Reversal",
    regime: "range",
    mode: "reversion",
    rsiHigh: 72,
    rsiLow: 28,
    description: "Smart reversal for sideways markets that targets RSI extremes and range bounces.",
    details: {
      overview: "Range-focused reversal strategy that uses RSI to identify extreme turning points.",
      bestFor: "Sideways markets and non-trending crypto pairs.",
      timeframe: "15m to 1h.",
      howItTrades: "Buys near RSI oversold readings and sells near RSI overbought readings, while avoiding trending breakouts.",
      howToRun: ["Pick 'Dijja8 Smart Reversal' in the Bots tab.", "Choose a range-bound symbol.", "Use 15m or 1h timeframe.", "Start with defaults."],
      whatToExpect: "Lower trade frequency than scalping, with higher probability entries in defined ranges.",
    },
  },
} as const;

type StrategyId = keyof typeof STRATEGIES;

const TICKS_PER_CANDLE = 4;
const MAX_TICKS = 260;
const MAX_CANDLES = 60;
const LEVERAGE = 100;
const TICK_MS = 1500;
const START_BALANCE = 10000;
const EABO_STORAGE_KEY = "eabo-sim-state-v1";
const EABO_CHANNEL_NAME = "eabo-sim-state";
const LOCAL_USERS_META_KEY = "kili_local_users_meta";
const LOCAL_EABO_REQUESTS_KEY = "kili_local_eabo_requests";
const LOCAL_WITHDRAWALS_KEY = "kili_local_withdrawals";
const LOCAL_TOPUPS_KEY = "kili_local_topups";

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type PersistedEaboState = {
  tab: TabKey;
  market: MarketState;
  balance: number;
  positions: Position[];
  activity: ActivityItem[];
  bots: BotModel[];
  selectedSymbol: string;
  botForm: { symbol: string; strategyId: StrategyId; timeframe: string; checkSec: number };
  tradeForm: { symbol: string; dir: 1 | -1; lots: number };
  askText: string;
  subscription: { active: boolean; plan: string; amount: number };
  pendingRequests: PendingRequest[];
};

type PaymentModalState = {
  open: boolean;
  type: PaymentAction | null;
  selectedNetwork: string;
  amount: string;
  address: string;
  countdown: number;
  step: "details" | "payment" | "pending";
};

function readLocalEaboRequests(): PendingRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_EABO_REQUESTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingRequest[];
  } catch {
    return [];
  }
}

function writeLocalEaboRequests(requests: PendingRequest[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_EABO_REQUESTS_KEY, JSON.stringify(requests));
  } catch {
    // ignore storage failures
  }
}

function readLocalWithdrawals(): PendingRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_WITHDRAWALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingRequest[];
  } catch {
    return [];
  }
}

function writeLocalWithdrawals(withdrawals: PendingRequest[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_WITHDRAWALS_KEY, JSON.stringify(withdrawals));
  } catch {
    // ignore
  }
}

function readLocalTopups(): PendingRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_TOPUPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingRequest[];
  } catch {
    return [];
  }
}

function writeLocalTopups(topups: PendingRequest[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_TOPUPS_KEY, JSON.stringify(topups));
  } catch {
    // ignore
  }
}

function getPersistedEaboState(): PersistedEaboState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EABO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEaboState;
  } catch {
    return null;
  }
}

function persistEaboState(state: PersistedEaboState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EABO_STORAGE_KEY, JSON.stringify(state));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(EABO_CHANNEL_NAME);
      channel.postMessage(state);
      channel.close();
    }
  } catch {
    // ignore storage failures in private browsing or restricted environments
  }
}

function fmt(value: number, decimals = 2) {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${fmt(Math.abs(value), 2)}`;
}

function formatCountdown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function ema(values: number[], period: number) {
  if (values.length === 0) return 0;
  if (values.length < period) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const slice = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
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
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const p = slice[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function classifyRegime(er: number) {
  if (er >= 0.3) return "trending";
  if (er < 0.15) return "choppy";
  return "range";
}

function evaluateStrategy(stratId: StrategyId, ind: IndicatorState): Signal {
  const cfg = STRATEGIES[stratId];
  const { ema12, ema26, rsiVal, er } = ind;
  const emaDiffPct = ema26 !== 0 ? ((ema12 - ema26) / ema26) * 100 : 0;
  const regime = classifyRegime(er);
  const confidence = clamp(Math.round(50 + emaDiffPct * 8 + (rsiVal - 50) * 0.6 + (er * 100 - 25) * 0.4), 5, 97);

  if (cfg.regime && regime !== cfg.regime) {
    return {
      action: "HOLD",
      confidence,
      regime,
      emaDiffPct,
      reason: cfg.regime === "trending"
        ? `${regime === "choppy" ? "Choppy" : "Range-bound"} market (ER=${er.toFixed(2)} < 0.30) — ${cfg.label} stands aside until a trend forms.`
        : `Market is trending (ER=${er.toFixed(2)} ≥ 0.30) — ${cfg.label} waits for a range to form before fading extremes.`,
    };
  }

  if (cfg.mode === "trend") {
    if (emaDiffPct >= (cfg.minEmaDiff ?? 0) && rsiVal > (cfg.rsiGate ?? 50)) {
      return { action: "BUY", confidence, regime, emaDiffPct, reason: `EMA12 is ${emaDiffPct.toFixed(2)}% above EMA26 and RSI=${rsiVal.toFixed(1)} confirms upside momentum (ER=${er.toFixed(2)}).` };
    }
    if (emaDiffPct <= -(cfg.minEmaDiff ?? 0) && rsiVal < 100 - (cfg.rsiGate ?? 50)) {
      return { action: "SELL", confidence, regime, emaDiffPct, reason: `EMA12 is ${Math.abs(emaDiffPct).toFixed(2)}% below EMA26 and RSI=${rsiVal.toFixed(1)} confirms downside momentum (ER=${er.toFixed(2)}).` };
    }
    return { action: "HOLD", confidence, regime, emaDiffPct, reason: `EMA/RSI not yet aligned (EMA Δ ${emaDiffPct.toFixed(2)}%, RSI ${rsiVal.toFixed(1)}) — waiting for stronger trend confirmation.` };
  }

  if (rsiVal >= (cfg.rsiHigh ?? 70)) {
    return { action: "SELL", confidence, regime, emaDiffPct, reason: `Overbought — RSI=${rsiVal.toFixed(1)} in a ${regime} market (ER=${er.toFixed(2)}). Fading back toward the mean.` };
  }
  if (rsiVal <= (cfg.rsiLow ?? 30)) {
    return { action: "BUY", confidence, regime, emaDiffPct, reason: `Oversold — RSI=${rsiVal.toFixed(1)} in a ${regime} market (ER=${er.toFixed(2)}). Fading back toward the mean.` };
  }

  return { action: "HOLD", confidence, regime, emaDiffPct, reason: `Price is inside the range (RSI=${rsiVal.toFixed(1)}) — waiting for an extreme to fade.` };
}

function seedMarket(): MarketState {
  const next: MarketState = {};
  SYMBOL_DEFS.forEach((symbol) => {
    next[symbol.id] = {
      price: symbol.basePrice,
      drift: (Math.random() - 0.5) * 0.4,
      ticks: [symbol.basePrice],
      candles: [{ o: symbol.basePrice, h: symbol.basePrice, l: symbol.basePrice, c: symbol.basePrice, t: 0 }],
      tickInCandle: 0,
      indicators: { ema12: symbol.basePrice, ema26: symbol.basePrice, rsiVal: 50, er: 0, atr: 0 },
    };
  });
  return next;
}

function stepSymbol(def: SymbolDef, state: MarketState[string], tickCount: number) {
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
  return { price, drift, ticks, candles, tickInCandle, indicators: { ema12, ema26, rsiVal, er, atr } };
}

function useTweenedNumber(target: number, duration = 350) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const from = display;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = clamp((ts - startRef.current) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) {
        rafRef.current = window.requestAnimationFrame(step);
      }
    };
    rafRef.current = window.requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

function Badge({ children, tone = "teal" }: { children: string; tone?: "teal" | "red" | "amber" | "gray" }) {
  const map = {
    teal: { bg: T.tealSoft, fg: T.teal },
    red: { bg: T.redSoft, fg: T.red },
    amber: { bg: T.amberSoft, fg: T.amber },
    gray: { bg: "rgba(255,255,255,0.06)", fg: T.textDim },
  } as const;
  const c = map[tone];
  return <span className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ background: c.bg, color: c.fg }}>{children}</span>;
}

function ActionBadge({ action }: { action: string }) {
  if (action === "BUY") return <Badge tone="teal">Buy</Badge>;
  if (action === "SELL") return <Badge tone="red">Sell</Badge>;
  return <Badge tone="gray">Hold</Badge>;
}

function RegimeBadge({ regime }: { regime: string }) {
  if (regime === "trending") return <span className="flex items-center gap-1 text-xs" style={{ color: T.teal }}><TrendingUp size={12} /> trending</span>;
  if (regime === "choppy") return <span className="flex items-center gap-1 text-xs" style={{ color: T.red }}>⌁ choppy</span>;
  return <span className="flex items-center gap-1 text-xs" style={{ color: T.amber }}>↔ range</span>;
}

function IndicatorBar({ label, value, unit = "", range = 10 }: { label: string; value: number; unit?: string; range?: number }) {
  const pct = clamp(((value + range) / (range * 2)) * 100, 0, 100);
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0" style={{ color: T.textDim }}>{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: T.borderSoft }}>
        <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: T.textFaint }} />
        <div className="absolute inset-y-0 rounded-full transition-all duration-500" style={{ background: positive ? T.teal : T.red, left: positive ? "50%" : `${pct}%`, width: `${Math.abs(pct - 50)}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right font-mono" style={{ color: positive ? T.teal : T.red }}>{value >= 0 ? "+" : ""}{value.toFixed(1)}{unit}</span>
    </div>
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

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border p-4 ${className}`} style={{ background: T.card, borderColor: T.border }}>{children}</div>;
}

function StrategyDetailsModal({ strategy, open, onClose }: { strategy: StrategyConfig; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border bg-card text-left shadow-2xl" style={{ borderColor: T.border }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: T.border }}>
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Strategy details</div>
            <h2 className="mt-2 text-2xl font-semibold">{strategy.label}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border p-2" style={{ borderColor: T.border, color: T.text }}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="text-sm leading-7" style={{ color: T.textDim }}>{strategy.details.overview}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">Best for</h3>
              <p className="mt-2 text-sm" style={{ color: T.textDim }}>{strategy.details.bestFor}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">Timeframe</h3>
              <p className="mt-2 text-sm" style={{ color: T.textDim }}>{strategy.details.timeframe}</p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">How it trades</h3>
            <p className="mt-2 text-sm leading-7" style={{ color: T.textDim }}>{strategy.details.howItTrades}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">How to run it</h3>
            <ul className="mt-3 space-y-2 text-sm" style={{ color: T.textDim }}>
              {strategy.details.howToRun.map((step, index) => (
                <li key={index} className="flex gap-2">
                  <span className="font-semibold">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">What to expect</h3>
            <p className="mt-2 text-sm leading-7" style={{ color: T.textDim }}>{strategy.details.whatToExpect}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSymbolDef(symbol: string) {
  return SYMBOL_DEFS.find((item) => item.id === symbol) ?? SYMBOL_DEFS[0];
}

function getTradingViewUrl(symbol: string, timeframe: string) {
  const tradingViewSymbol = getTradingViewChartSymbol(symbol);
  const interval = timeframe === "1m" ? "1" : timeframe === "5m" ? "5" : timeframe === "15m" ? "15" : timeframe === "1h" ? "60" : "240";
  const params = new URLSearchParams({
    frameElementId: `tradingview_${symbol.toLowerCase()}`,
    symbol: tradingViewSymbol,
    interval,
    theme: "dark",
    style: "1",
    locale: "en",
    timezone: "Etc/UTC",
    toolbarbg: "%23f1f3f6",
    allow_symbol_change: "false",
    save_image: "false",
    details: "1",
    calendar: "false",
    hotlist: "false",
    news: "false",
    withdateranges: "false",
  });
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
}

function getTradingViewChartSymbol(symbol: string) {
  const spec = getSymbolSpec(symbol);
  const specialSymbols: Record<string, string> = {
    XAUUSD: "OANDA:XAUUSD",
    XAGUSD: "OANDA:XAGUSD",
    XPTUSD: "OANDA:XPTUSD",
    XPDUSD: "OANDA:XPDUSD",
    BRENTUSD: "TVC:UKOIL",
    WTIUSD: "TVC:USOIL",
    NATGASUSD: "TVC:NATURALGAS",
    GASOLINEUSD: "NYMEX:RB1!",
    COPPERUSD: "COMEX:HG1!",
    WHEATUSD: "CBOT:ZW1!",
    CORNUSD: "CBOT:ZC1!",
    SUGARUSD: "NYMEX:SB1!",
    COCOAUSD: "ICEUS:CC1!",
    COFFEEUSD: "ICEUS:KC1!",
    NAS100: "NASDAQ:NDX",
    US30: "DJ:DJI",
    SPX500: "SP:SPX",
    GER40: "XETR:DAX",
    UK100: "TVC:UKX",
    JPN225: "TVC:NI225",
    FRA40: "TVC:CAC40",
    AUS200: "ASX:XJO",
  };
  if (specialSymbols[symbol]) return specialSymbols[symbol];
  if (spec.assetClass === "Forex") return `OANDA:${symbol}`;
  return `BINANCE:${spec.feedSymbol}`;
}

function getPositionPnl(position: Position, market: MarketState) {
  const current = market[position.symbol];
  const def = getSymbolDef(position.symbol);
  if (!current) return 0;
  return (current.price - position.entry) * position.dir * position.lots * def.multiplier;
}

export function EABOTestPage() {
  const search = useSearch({ from: "/_authenticated/eabottest" });
  const { user } = useAuth();
  const persistedState = getPersistedEaboState();
  const [tab, setTab] = useState<TabKey>((search.tab as TabKey) ?? persistedState?.tab ?? "chart");
  const tickCountRef = useRef(0);
  const [market, setMarket] = useState<MarketState>(() => ({ ...seedMarket(), ...(persistedState?.market ?? {}) }));
  const [balance, setBalance] = useState(persistedState?.balance ?? START_BALANCE);
  const [positions, setPositions] = useState<Position[]>(persistedState?.positions ?? []);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [demoOutcomeMode, setDemoOutcomeMode] = useState<DemoOutcomeMode>("normal");
  const [activity, setActivity] = useState<ActivityItem[]>(persistedState?.activity ?? [{ t: Date.now(), text: "Simulation started — demo account funded with $10,000.00.", kind: "info" }]);
  const [bots, setBots] = useState<BotModel[]>(persistedState?.bots ?? []);
  const [selectedSymbol, setSelectedSymbol] = useState(persistedState?.selectedSymbol ?? "XAUUSD");
  const [botForm, setBotForm] = useState(persistedState?.botForm ?? { symbol: "XAUUSD", strategyId: "momentum" as StrategyId, timeframe: "1h", checkSec: 60 });
  const [tradeForm, setTradeForm] = useState(persistedState?.tradeForm ?? { symbol: "XAUUSD", dir: 1 as 1 | -1, lots: 0.1 });
  const [manualOrderCollapsed, setManualOrderCollapsed] = useState(true);
  const [expandedPositionIds, setExpandedPositionIds] = useState<Record<string, boolean>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [askText, setAskText] = useState(persistedState?.askText ?? "");
  const [subscription, setSubscription] = useState(persistedState?.subscription ?? { active: false, plan: "Basic", amount: 0 });
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(() => {
    if (typeof window === "undefined") return persistedState?.pendingRequests ?? [];
    const allRequests = [...readLocalEaboRequests(), ...readLocalTopups(), ...readLocalWithdrawals()];
    if (allRequests.length > 0) return allRequests;
    return persistedState?.pendingRequests ?? [
      { id: "1", type: "subscription", title: "Subscription", amount: 99, status: "Pending", network: "BTC", createdAt: Date.now() },
      { id: "2", type: "topup", title: "Top-up", amount: 500, status: "Pending approval", network: "BTC", createdAt: Date.now() },
      { id: "3", type: "withdraw", title: "Withdrawal request", amount: 250, status: "Pending approval", network: "USDT TRC20", createdAt: Date.now() },
    ];
  });
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>({ open: false, type: null, selectedNetwork: "BTC", amount: "", address: "", countdown: 20 * 60, step: "details" });

  useEffect(() => {
    setTab(search.tab as TabKey);
  }, [search.tab]);

  useEffect(() => {
    if (!user) return;

    const refreshUserAccount = async () => {
      if (isLocalMode()) {
        setBalance(getLocalUserMeta(user.email ?? "").balance ?? START_BALANCE);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("users")
          .select("balance, subscribed, subscription_status, subscription_plan, subscription_amount, subscription_network, trading_outcome_mode")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          setBalance(Number(data.balance ?? START_BALANCE));
          setSubscription({
            active: data.subscription_status === "approved" || Boolean(data.subscribed),
            plan: data.subscription_plan ?? subscription.plan,
            amount: Number(data.subscription_amount ?? subscription.amount),
          });
          if (["normal", "profit", "loss"].includes(data.trading_outcome_mode)) {
            setDemoOutcomeMode(data.trading_outcome_mode as DemoOutcomeMode);
          }
        }
      } catch {
        setBalance(getLocalUserMeta(user.email ?? "").balance ?? START_BALANCE);
      }
    };

    void refreshUserAccount();

    if (!isLocalMode() && typeof window !== "undefined") {
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          void refreshUserAccount();
        }
      };
      const interval = window.setInterval(() => {
        void refreshUserAccount();
      }, 10000);
      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }
  }, [user, subscription.amount, subscription.plan]);

  useEffect(() => {
    if (!user || !isLocalMode()) return;

    const refreshBalance = () => {
      setBalance(getLocalUserMeta(user.email ?? "").balance ?? START_BALANCE);
    };

    const refreshSubscriptionRequest = () => {
      const meta = getLocalUserMeta(user.email ?? "");
      const status = meta.subscription_status ?? "pending";
      const statusLabel = status === "approved" ? "Approved" : status === "declined" ? "Declined" : "Pending";
      const requestId = meta.subscription_request_id;
      const currentAmount = meta.subscription_amount ?? pendingRequests.find((item) => item.title === "Subscription")?.amount ?? 99;
      const currentNetwork = meta.subscription_network ?? pendingRequests.find((item) => item.title === "Subscription")?.network ?? "BTC";

      if (requestId) {
        setPendingRequests((prev) => {
          const updated = prev.map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  title: "Subscription",
                  amount: currentAmount,
                  status: statusLabel,
                  network: currentNetwork,
                }
              : item,
          );

          const exists = updated.some((item) => item.id === requestId);
          if (exists) {
            return updated;
          }

          return [
            {
              id: requestId,
              type: "subscription",
              title: "Subscription",
              amount: currentAmount,
              status: statusLabel,
              network: currentNetwork,
              createdAt: Date.now(),
            },
            ...prev,
          ].slice(0, 20);
        });
      }

      setSubscription((prev) => ({
        active: status === "approved",
        plan: meta.subscription_plan ?? prev.plan,
        amount: currentAmount,
      }));
    };

    const refreshPaymentRequests = () => {
      setPendingRequests(() => {
        const withdrawals = readLocalWithdrawals();
        const topups = readLocalTopups();
        const subscriptionRequests = readLocalEaboRequests().filter((item) => item.type === "subscription");
        return [...subscriptionRequests, ...topups, ...withdrawals];
      });
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === LOCAL_USERS_META_KEY || event.key === "kili-local-user-meta-refresh") {
        refreshBalance();
        refreshSubscriptionRequest();
      }
      if (event.key === LOCAL_TOPUPS_KEY || event.key === LOCAL_WITHDRAWALS_KEY) {
        refreshPaymentRequests();
      }
    };

    window.addEventListener("kili-local-user-meta-updated", refreshBalance);
    window.addEventListener("kili-local-user-meta-updated", refreshSubscriptionRequest);
    window.addEventListener("kili-local-payments-updated", refreshPaymentRequests);
    window.addEventListener("storage", handleStorageEvent);

    refreshSubscriptionRequest();
    refreshPaymentRequests();

    return () => {
      window.removeEventListener("kili-local-user-meta-updated", refreshBalance);
      window.removeEventListener("kili-local-user-meta-updated", refreshSubscriptionRequest);
      window.removeEventListener("kili-local-payments-updated", refreshPaymentRequests);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [user, pendingRequests]);

  const logActivity = (text: string, kind: ActivityItem["kind"] = "info") => {
    setActivity((prev) => [{ t: Date.now(), text, kind }, ...prev].slice(0, 60));
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      tickCountRef.current += 1;
      const tickCount = tickCountRef.current;
      setMarket((prev) => {
        const next: MarketState = {};
        SYMBOL_DEFS.forEach((def) => {
          next[def.id] = stepSymbol(def, prev[def.id], tickCount);
        });
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    persistEaboState({
      tab,
      market,
      balance,
      positions,
      activity,
      bots,
      selectedSymbol,
      botForm,
      tradeForm,
      askText,
      subscription,
      pendingRequests,
    });
  }, [tab, market, balance, positions, activity, bots, selectedSymbol, botForm, tradeForm, askText, subscription, pendingRequests]);

  useEffect(() => {
    writeLocalEaboRequests(pendingRequests);
  }, [pendingRequests]);

  useEffect(() => {
    if (!paymentModal.open) return;

    const timer = window.setInterval(() => {
      setPaymentModal((prev) => (prev.open ? { ...prev, countdown: Math.max(0, prev.countdown - 1) } : prev));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [paymentModal.open]);

  // Fetch closed trades from database
  useEffect(() => {
    const fetchClosedTrades = async () => {
      try {
        if (!user?.id || !supabase) return;

        // Fetch closed manual trades
        const { data: manualTrades, error: manualError } = await supabase
          .from("manual_trades")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(50);

        if (manualError) {
          console.warn("Failed to fetch closed manual trades:", manualError);
        }

        // Fetch closed bot trades
        const { data: botTrades, error: botError } = await supabase
          .from("bot_trades")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(50);

        if (botError) {
          console.warn("Failed to fetch closed bot trades:", botError);
        }

        // Combine and sort by closed_at
        const allClosed = [
          ...(manualTrades || []).map((t: any) => ({ ...t, source: "manual", side: t.dir === 1 ? "buy" : "sell", volume: t.lots })),
          ...(botTrades || []).map((t: any) => ({ ...t, source: "bot" })),
        ].sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());

        setClosedTrades(allClosed);
      } catch (err) {
        console.warn("Error fetching closed trades:", err);
      }
    };

    const timer = window.setInterval(() => {
      void fetchClosedTrades();
    }, 5000); // Refresh every 5 seconds

    void fetchClosedTrades(); // Fetch immediately on mount

    return () => window.clearInterval(timer);
  }, [user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBots((prevBots) => {
        if (prevBots.length === 0) return prevBots;
        return prevBots.map((bot) => {
          if (!bot.running) return bot;

          const current = market[bot.symbol];
          if (!current) return bot;

          const elapsed = bot.elapsed + 1000;
          if (elapsed < bot.checkSec * 1000) {
            return { ...bot, elapsed };
          }

          const signal = evaluateStrategy(bot.strategyId, current.indicators);
          const confHistory = [...bot.confHistory, { v: signal.confidence }].slice(-30);
          const decisions = [{ t: Date.now(), action: signal.action, reason: signal.reason, confidence: signal.confidence }, ...bot.decisions].slice(0, 12);
          const shouldAct = signal.action !== "HOLD" && signal.confidence >= 60;
          const shouldOpen = shouldAct && (!bot.lastSignal || bot.lastSignal.action !== signal.action || bot.lastSignal.confidence < 60);
          const shouldFlip = shouldAct && bot.lastSignal && bot.lastSignal.action !== signal.action && bot.lastSignal.confidence >= 60;

          if (shouldOpen || shouldFlip) {
            setPositions((positionsState) => {
              const existing = positionsState.find((pos) => pos.botId === bot.id);
              const def = getSymbolDef(bot.symbol);
              if (!existing && shouldOpen) {
                const newPos: Position = { id: `${bot.id}-${Date.now()}`, symbol: bot.symbol, dir: signal.action === "BUY" ? 1 : -1, lots: def.defaultLots, entry: current.price, botId: bot.id, openedAt: Date.now(), outcomeMode: demoOutcomeMode, dbId: null };
                void persistDemoPosition(newPos).then((dbId) => {
                  if (dbId) setPositions((prev) => prev.map((item) => item.id === newPos.id ? { ...item, dbId } : item));
                });
                logActivity(`${bot.symbol} · ${STRATEGIES[bot.strategyId].label} — opened ${signal.action} ${def.defaultLots} lots @ ${fmt(current.price, def.decimals)}.`, signal.action === "BUY" ? "buy" : "sell");
                return [newPos, ...positionsState];
              }
              if (existing && shouldFlip) {
                const rawPnl = (current.price - existing.entry) * existing.dir * existing.lots * def.multiplier;
                const pnl = resolveDemoPnl(rawPnl, existing);
                setBalance((value) => value + pnl);
                const exitPrice = existing.entry + (existing.dir === 1 ? pnl : -pnl) / Math.max(existing.lots * def.multiplier, 0.000001);
                void persistClosedTrade({ ...existing, outcomeMode: existing.outcomeMode ?? "normal" }, pnl, exitPrice, "bot");
                logActivity(`${bot.symbol} · ${STRATEGIES[bot.strategyId].label} — closed on signal flip, realized ${fmtMoney(pnl)}.`, pnl >= 0 ? "buy" : "sell");
                return positionsState.filter((pos) => pos.id !== existing.id);
              }
              return positionsState;
            });
          }

          return {
            ...bot,
            elapsed: 0,
            lastSignal: signal,
            confHistory,
            decisions,
          };
        });
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [market, demoOutcomeMode, user]);

  const unrealizedTotal = positions.reduce((sum, position) => sum + getPositionPnl(position, market), 0);

  const equity = balance + unrealizedTotal;
  const usedMargin = positions.reduce((sum, position) => {
    const current = market[position.symbol];
    const def = getSymbolDef(position.symbol);
    if (!current) return sum;
    return sum + (current.price * position.lots * def.multiplier) / LEVERAGE;
  }, 0);
  const freeMargin = equity - usedMargin;

  const animBalance = useTweenedNumber(balance);
  const animEquity = useTweenedNumber(equity);
  const animProfit = useTweenedNumber(unrealizedTotal);

  // Persist live demo balance to Supabase for authenticated users (debounced)
  useEffect(() => {
    if (!user) return;
    if (isLocalMode()) return;

    let timer: number | null = null;
    const id = user.id;
    const persist = async () => {
      try {
        if (!supabase || typeof supabase.from !== 'function') return;
        const res = await supabase.from('users').update({ balance }).eq('id', id);
        // trigger client-side refresh listeners (admin/profile listen for this pattern elsewhere)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kili-local-user-meta-refresh', String(Date.now()));
          window.dispatchEvent(new Event('kili-local-user-meta-updated'));
        }
        return res;
      } catch {
        // ignore persistence failures
      }
    };

    // debounce writes to avoid excessive calls during rapid P/L updates
    timer = window.setTimeout(() => {
      void persist();
    }, 900);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [balance, user]);

  const resolveDemoPnl = (rawPnl: number, position: Position) => {
    if (position.outcomeMode === "normal") return rawPnl;
    const def = getSymbolDef(position.symbol);
    const fallback = Math.max(Math.abs(position.entry * position.lots * def.multiplier * 0.02), 25);
    return position.outcomeMode === "profit" ? Math.max(Math.abs(rawPnl), fallback) : -Math.max(Math.abs(rawPnl), fallback);
  };

  const addClosedTradeToHistory = (position: Position, pnl: number, exitPrice: number, closedAt: string, source: "manual" | "bot" = "manual") => {
    const historyEntry = {
      id: position.dbId ?? `history-${position.id}`,
      source,
      symbol: position.symbol,
      side: position.dir === 1 ? "buy" : "sell",
      volume: position.lots,
      lots: position.lots,
      dir: position.dir,
      entry_price: position.entry,
      exit_price: exitPrice,
      pnl,
      status: "closed",
      outcome_mode: position.outcomeMode ?? "normal",
      closed_at: closedAt,
      created_at: closedAt,
      trade_type: position.botId ? "bot" : "manual",
    };

    setClosedTrades((prev) => [historyEntry, ...prev.filter((entry) => entry.id !== historyEntry.id)]);
  };

  const persistClosedTrade = async (position: Position, pnl: number, exitPrice: number, source: "manual" | "bot" = "manual") => {
    if (!user || isLocalMode()) return null;

    const closedAt = new Date().toISOString();
    const isBot = position.botId ? true : false;
    const tableName = isBot ? "bot_trades" : "manual_trades";

    // Build payload based on table schema
    const payload = {
      user_id: user.id,
      user_email: user.email,
      symbol: position.symbol,
      entry_price: position.entry,
      exit_price: exitPrice,
      pnl,
      status: "closed",
      outcome_mode: position.outcomeMode ?? "normal",
      opened_at: new Date(position.openedAt).toISOString(),
      closed_at: closedAt,
      ...(isBot ? {
        side: position.dir === 1 ? "buy" : "sell",
        volume: position.lots,
        trade_type: "bot",
      } : {
        dir: position.dir,
        lots: position.lots,
        trade_type: "manual",
      }),
    };

    try {
      if (position.dbId) {
        const { error } = await (supabase as any).from(tableName).update(payload).eq("id", position.dbId);
        if (!error) {
          addClosedTradeToHistory(position, pnl, exitPrice, closedAt, source);
          return position.dbId;
        }
      }

      const inserted = await (supabase as any).from(tableName).insert(payload).select("id").single();
      if (inserted.error) throw inserted.error;
      addClosedTradeToHistory({ ...position, dbId: inserted.data?.id ?? position.dbId }, pnl, exitPrice, closedAt, source);
      return inserted.data?.id ?? null;
    } catch (error) {
      console.warn("[Demo trades] Failed to save closed trade:", error);
      addClosedTradeToHistory(position, pnl, exitPrice, closedAt, source);
      return null;
    }
  };

  const persistDemoPosition = async (position: Position) => {
    if (!user || isLocalMode()) return null;
    const isBot = position.botId ? true : false;
    const tableName = isBot ? "bot_trades" : "manual_trades";

    try {
      const payload = {
        user_id: user.id,
        user_email: user.email,
        symbol: position.symbol,
        entry_price: position.entry,
        status: "open",
        outcome_mode: position.outcomeMode ?? "normal",
        opened_at: new Date(position.openedAt).toISOString(),
        ...(isBot ? {
          side: position.dir === 1 ? "buy" : "sell",
          volume: position.lots,
          trade_type: "bot",
        } : {
          dir: position.dir,
          lots: position.lots,
          trade_type: "manual",
        }),
      };

      const inserted = await (supabase as any).from(tableName).insert(payload).select("id").single();
      if (inserted.error) throw inserted.error;
      return inserted.data?.id ?? null;
    } catch (error) {
      console.warn("[Demo trades] Failed to persist position:", error);
      return null;
    }
  };

  const closePosition = (id: string) => {
    const position = positions.find((item) => item.id === id);
    if (!position) return;
    const rawPnl = getPositionPnl(position, market);
    const pnl = resolveDemoPnl(rawPnl, position);
    const exitPrice = position.entry + (position.dir === 1 ? pnl : -pnl) / Math.max(position.lots * getSymbolDef(position.symbol).multiplier, 0.000001);

    setBalance((value) => value + pnl);
    setPositions((prev) => prev.filter((item) => item.id !== id));

    void persistClosedTrade(position, pnl, exitPrice, "manual");

    logActivity(`Closed ${position.symbol} ${position.dir === 1 ? "BUY" : "SELL"} ${position.lots} lots manually — realized ${fmtMoney(pnl)}.`, pnl >= 0 ? "buy" : "sell");
  };

  const openManualPosition = () => {
    const def = getSymbolDef(tradeForm.symbol);
    const current = market[tradeForm.symbol];
    if (!current) return;
    const newPos: Position = { id: `manual-${Date.now()}`, symbol: tradeForm.symbol, dir: tradeForm.dir, lots: tradeForm.lots, entry: current.price, botId: null, openedAt: Date.now(), outcomeMode: demoOutcomeMode, dbId: null };
    setPositions((prev) => [newPos, ...prev]);
    void persistDemoPosition(newPos).then((dbId) => {
      if (dbId) setPositions((prev) => prev.map((item) => item.id === newPos.id ? { ...item, dbId } : item));
    });
    logActivity(`Manually opened ${tradeForm.symbol} ${tradeForm.dir === 1 ? "BUY" : "SELL"} ${tradeForm.lots} lots @ ${fmt(current.price, def.decimals)}.`, tradeForm.dir === 1 ? "buy" : "sell");
  };

  const startBot = () => {
    const id = `bot-${Date.now()}`;
    setBots((prev) => [...prev, { id, symbol: botForm.symbol, strategyId: botForm.strategyId, timeframe: botForm.timeframe, checkSec: Number(botForm.checkSec), elapsed: 0, running: true, lastSignal: null, confHistory: [], decisions: [] }]);
    logActivity(`Started ${STRATEGIES[botForm.strategyId].label} bot on ${botForm.symbol} (${botForm.timeframe}, checks every ${botForm.checkSec}s).`, "info");
  };

  const stopBot = (id: string) => {
    setBots((prev) => prev.map((bot) => (bot.id === id ? { ...bot, running: false } : bot)));
    logActivity(`Stopped bot on ${bots.find((bot) => bot.id === id)?.symbol}.`, "info");
  };

  const removeBot = (id: string) => setBots((prev) => prev.filter((bot) => bot.id !== id));

  const openPaymentModal = (type: PaymentAction) => {
    const defaultAmount = type === "subscribe" ? "99" : type === "topup" ? "500" : "250";
    const defaultNetwork = type === "withdraw" ? "USDT TRC20" : "BTC";
    const networkAddress = getPaymentAddress(defaultNetwork);

    setPaymentModal({
      open: true,
      type,
      selectedNetwork: defaultNetwork,
      amount: defaultAmount,
      address: networkAddress,
      countdown: 20 * 60,
      step: "details",
    });
  };

  const closePaymentModal = () => {
    setPaymentModal({ open: false, type: null, selectedNetwork: "BTC", amount: "", address: "", countdown: 20 * 60, step: "details" });
  };

  const showPaymentDetails = () => {
    const parsed = Number(paymentModal.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logActivity("Enter a valid amount before proceeding.", "info");
      return;
    }

    setPaymentModal((prev) => ({ ...prev, step: "payment", address: getPaymentAddress(prev.selectedNetwork), countdown: 20 * 60 }));
  };

  const confirmPayment = async () => {
    if (!paymentModal.type) return;

    const parsed = Number(paymentModal.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logActivity("Enter a valid amount before confirming.", "info");
      return;
    }

    if (paymentModal.countdown <= 0) {
      logActivity("This payment window has expired. Please open it again.", "info");
      return;
    }

    if (paymentModal.type === "subscribe") {
      if (balance < parsed) {
        logActivity("Subscription failed — insufficient balance.", "info");
        return;
      }
    } else if (paymentModal.type === "withdraw" && parsed > balance) {
      logActivity("Withdrawal failed — insufficient balance.", "info");
      return;
    }

    const actionLabel = paymentModal.type === "subscribe" ? "subscription" : paymentModal.type === "topup" ? "top-up" : "withdrawal";
    const requestId = createRequestId();
    logActivity(`Your ${actionLabel} request is now pending confirmation.`, "info");

    const request: PendingRequest = {
      id: requestId,
      type: paymentModal.type === "subscribe" ? "subscription" : paymentModal.type === "topup" ? "topup" : "withdraw",
      title: paymentModal.type === "subscribe" ? "Subscription" : paymentModal.type === "topup" ? "Top-up" : "Withdrawal request",
      amount: parsed,
      status: paymentModal.type === "subscribe" ? "Pending" : "Pending approval",
      network: paymentModal.selectedNetwork,
      address: paymentModal.type === "withdraw" ? paymentModal.address : undefined,
      createdAt: Date.now(),
    };

    const isLocalUser = !!user?.id?.toString().startsWith("local-");
    const shouldPersistToSupabase = !!user && !isLocalUser;

    setPendingRequests((prev) => [request, ...prev].slice(0, 20));

    if (paymentModal.type === "subscribe") {
      const requestMeta = {
        subscription_status: "pending",
        subscription_plan: "Pro Bot",
        subscription_amount: parsed,
        subscription_network: paymentModal.selectedNetwork,
        subscribed: false,
      };

      if (shouldPersistToSupabase) {
        try {
          const { error: requestError } = await supabase.from("subscription_requests").insert({
            user_id: user!.id,
            user_email: user!.email ?? null,
            subscription_plan: "Pro Bot",
            amount: parsed,
            network: paymentModal.selectedNetwork,
            status: "pending",
            created_at: new Date().toISOString(),
          });
          if (requestError) throw requestError;

          const { error: userError } = await supabase.from("users").update(requestMeta).eq("id", user!.id);
          if (userError) throw userError;
        } catch (error: any) {
          console.warn("Failed to persist subscription request", error?.message ?? error);
        }
      } else if (isLocalMode()) {
        writeLocalUserMeta(user?.email ?? "", requestMeta);
      }
    }

    if (paymentModal.type === "topup" || paymentModal.type === "withdraw") {
      if (shouldPersistToSupabase) {
        try {
          if (paymentModal.type === "topup") {
            const { error } = await supabase.from("topups").insert({
              user_id: user!.id,
              user_email: user!.email ?? null,
              amount: parsed,
              network: paymentModal.selectedNetwork,
              status: "pending",
              created_at: new Date().toISOString(),
            });
            if (error) throw error;
          }

          if (paymentModal.type === "withdraw") {
            const { error } = await supabase.from("withdrawals").insert({
              user_id: user!.id,
              user_email: user!.email ?? null,
              amount: parsed,
              network: paymentModal.selectedNetwork,
              address: paymentModal.address,
              status: "pending",
              created_at: new Date().toISOString(),
            });
            if (error) throw error;
          }
        } catch (error: any) {
          console.warn("Failed to persist payment request to Supabase", error?.message ?? error);
        }
      } else if (isLocalMode()) {
        if (paymentModal.type === "topup") {
          writeLocalTopups([...readLocalTopups(), { ...request, userEmail: user?.email ?? "" }]);
        }
        if (paymentModal.type === "withdraw") {
          writeLocalWithdrawals([...readLocalWithdrawals(), { ...request, userEmail: user?.email ?? "" }]);
        }
        window.dispatchEvent(new Event("kili-local-payments-updated"));
      }
    }

    setPaymentModal((prev) => ({ ...prev, step: "pending" }));

    window.setTimeout(() => {
      if (paymentModal.type === "subscribe") {
        setBalance((value) => value - parsed);
        setSubscription({ active: false, plan: "Pro Bot", amount: parsed });
        if (user && isLocalMode()) {
          writeLocalUserMeta(user.email ?? "", {
            balance: getLocalUserMeta(user.email ?? "").balance - parsed,
            subscription_amount: parsed,
            subscription_network: paymentModal.selectedNetwork,
            subscription_request_id: requestId,
          });
        }
        logActivity(`Subscription request for Pro Bot is pending approval and ${fmtMoney(parsed)} has been reserved.`, "info");
      } else if (paymentModal.type === "topup") {
        logActivity(`Top-up request of ${fmtMoney(parsed)} is pending approval.`, "info");
      } else {
        logActivity(`Withdrawal request for ${fmtMoney(parsed)} is pending approval.`, "info");
      }
      closePaymentModal();
    }, 1400);
  };

  const askModel = (bot: BotModel) => {
    if (!askText.trim() || !bot.lastSignal) return;
    const q = askText.toLowerCase();
    let answer = bot.lastSignal.reason;
    if (q.includes("why") && q.includes("hold")) answer = `Currently holding: ${bot.lastSignal.reason}`;
    else if (q.includes("buy")) answer = bot.lastSignal.action === "BUY" ? bot.lastSignal.reason : `Not buying right now — ${bot.lastSignal.reason}`;
    else if (q.includes("sell")) answer = bot.lastSignal.action === "SELL" ? bot.lastSignal.reason : `Not selling right now — ${bot.lastSignal.reason}`;
    else if (q.includes("confidence")) answer = `Current confidence is ${bot.lastSignal.confidence}%, derived from EMA separation, RSI, and the efficiency ratio — not a fixed or fabricated score.`;
    setBots((prev) => prev.map((item) => (item.id === bot.id ? { ...item, decisions: [{ t: Date.now(), action: "ASK", reason: answer, confidence: bot.lastSignal!.confidence, q: askText }, ...item.decisions].slice(0, 12) } : item)));
    setAskText("");
  };

  const currentSymbol = selectedSymbol;
  const chartSpec = getSymbolSpec(currentSymbol);
  const currentMarketSymbol = SYMBOL_DEFS.some((item) => item.id === currentSymbol) ? currentSymbol : "XAUUSD";
  const currentDef = getSymbolDef(currentMarketSymbol);
  const current = market[currentMarketSymbol];

  return (
    <main className="portfolio-shell min-h-screen w-full bg-background text-foreground" style={{ background: T.bg, color: T.text }}>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-3 pb-24 pt-3 sm:px-4">
        {paymentModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-6">
            <div className="w-full max-w-md rounded-3xl border p-4 shadow-2xl" style={{ background: T.card, borderColor: T.border }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="section-kicker">{paymentModal.type === "subscribe" ? "Bot subscription" : paymentModal.type === "topup" ? "Top-up request" : "Withdrawal request"}</div>
                  <div className="mt-1 text-xl font-semibold">{paymentModal.type === "subscribe" ? "Secure crypto payment" : paymentModal.type === "topup" ? "Add funds safely" : "Withdraw to a wallet"}</div>
                </div>
                <button onClick={closePaymentModal} className="rounded-full border p-2" style={{ background: T.cardAlt, borderColor: T.border, color: T.textDim }}>
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border p-3" style={{ background: T.cardAlt, borderColor: T.border }}>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>
                  <span className={paymentModal.step === "details" ? "text-teal-400" : "text-muted-foreground"}>1. Details</span>
                  <span style={{ color: T.textFaint }}>•</span>
                  <span className={paymentModal.step === "payment" || paymentModal.step === "pending" ? "text-teal-400" : "text-muted-foreground"}>2. Payment</span>
                </div>

                {paymentModal.step === "pending" ? (
                  <div className="rounded-2xl border p-4 text-center" style={{ background: T.card, borderColor: T.border }}>
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>
                      <RefreshCw size={20} className="animate-spin" />
                    </div>
                    <div className="text-sm font-semibold">Pending confirmation</div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: T.textDim }}>
                      Your request is being processed and will be finalized shortly.
                    </div>
                  </div>
                ) : paymentModal.step === "details" ? (
                  <>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Network</label>
                    <select
                      value={paymentModal.selectedNetwork}
                      onChange={(event) => {
                        const network = event.target.value;
                        setPaymentModal((prev) => ({ ...prev, selectedNetwork: network, address: getPaymentAddress(network) }));
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.card, borderColor: T.border, color: T.text }}
                    >
                      <option value="BTC">Bitcoin</option>
                      <option value="ETH">Ethereum</option>
                      <option value="USDT TRC20">USDT TRC20</option>
                      <option value="USDC">USDC</option>
                      <option value="SOL">Solana</option>
                    </select>

                    <label className="mt-3 mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Amount</label>
                    <input
                      type="number"
                      min="1"
                      value={paymentModal.amount}
                      onChange={(event) => setPaymentModal((prev) => ({ ...prev, amount: event.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.card, borderColor: T.border, color: T.text }}
                    />
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-2xl border p-3" style={{ background: T.card, borderColor: T.border }}>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Network</div>
                        <div className="mt-1 text-sm font-semibold">{paymentModal.selectedNetwork}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Amount</div>
                        <div className="mt-1 text-sm font-semibold">{fmtMoney(Number(paymentModal.amount || 0))}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl border p-3" style={{ background: T.card, borderColor: T.border }}>
                      <div className="pr-3">
                        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>{paymentModal.type === "withdraw" ? "Destination wallet" : "Deposit address"}</div>
                        <div className="mt-1 break-all font-mono text-xs" style={{ color: T.text }}>{paymentModal.address}</div>
                      </div>
                      <div className="rounded-xl border p-2" style={{ background: T.cardAlt, borderColor: T.border }}>
                        <div className="grid grid-cols-4 gap-1">
                          {Array.from({ length: 24 }).map((_, index) => (
                            <div key={index} className="h-2.5 w-2.5 rounded-sm" style={{ background: index % 2 === 0 ? T.teal : T.textFaint }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {paymentModal.step === "payment" && (
                <>
                  <div className="mt-4 flex items-center justify-between rounded-2xl border px-3 py-2" style={{ background: T.cardAlt, borderColor: T.border }}>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Expiry</div>
                      <div className="text-sm font-semibold" style={{ color: paymentModal.countdown > 0 ? T.teal : T.red }}>{formatCountdown(paymentModal.countdown)}</div>
                    </div>
                    <div className="text-right text-xs" style={{ color: T.textDim }}>
                      <div>Secure wallet transfer</div>
                      <div>20 minute window</div>
                    </div>
                  </div>

                  {paymentModal.type === "withdraw" && (
                    <div className="mt-4 rounded-2xl border p-3" style={{ background: T.cardAlt, borderColor: T.border }}>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Destination wallet</label>
                      <input
                        value={paymentModal.address}
                        onChange={(event) => setPaymentModal((prev) => ({ ...prev, address: event.target.value }))}
                        placeholder="Enter wallet address"
                        className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.card, borderColor: T.border, color: T.text }}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="mt-4 flex gap-2">
                <button onClick={closePaymentModal} className="flex-1 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                  Cancel
                </button>
                {paymentModal.step === "details" ? (
                  <button onClick={showPaymentDetails} className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: T.teal, color: "#04231F" }}>
                    Continue
                  </button>
                ) : paymentModal.step === "pending" ? (
                  <button className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: T.border, color: T.textDim }} disabled>
                    Pending confirmation
                  </button>
                ) : (
                  <button onClick={confirmPayment} disabled={paymentModal.countdown <= 0} className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: paymentModal.countdown > 0 ? T.teal : T.border, color: paymentModal.countdown > 0 ? "#04231F" : T.textDim }}>
                    {paymentModal.type === "subscribe" ? "Confirm subscription" : paymentModal.type === "topup" ? "Confirm top-up" : "Confirm withdrawal"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <header className="mb-3 flex items-center justify-between rounded-2xl border px-4 py-3" style={{ background: T.card, borderColor: T.border }}>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <RefreshCw size={18} className="text-primary" />
            </div>
            <div>
              <p className="section-kicker">Live trading</p>
              <h1 className="section-title">Bot overview</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary" style={{ borderColor: T.border }}>
            <span className="inline-block h-2 w-2 rounded-full bg-primary" /> LIVE
          </div>
        </header>

        <section className="mb-3 rounded-2xl border p-4" style={{ background: T.card, borderColor: T.border }}>
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
        </section>

        <div className="mb-3 rounded-2xl border p-3" style={{ background: T.card, borderColor: T.border }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="section-kicker">Premium access</div>
              <div className="text-base font-semibold">Automated bot trading & signal</div>
            </div>
            <div className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ background: subscription.active ? T.tealSoft : T.amberSoft, borderColor: T.border, color: subscription.active ? T.teal : T.amber }}>
              {subscription.active ? "Active" : "Available"}
            </div>
          </div>
          <div className="rounded-2xl border p-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset]" style={{ background: `linear-gradient(135deg, ${T.card} 0%, ${T.cardAlt} 100%)`, borderColor: T.border }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>
                  <Bot size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">Premium bot access</div>
                    <div className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>Premium</div>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: T.textDim }}>{subscription.active ? "Your premium automation and signal access is active." : "Unlock premium automation and richer signals for your next trade."}</div>
                </div>
              </div>
              <div className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>Pro</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[11px]" style={{ borderColor: T.borderSoft }}>
              <div className="rounded-xl border px-2.5 py-2" style={{ background: T.card, borderColor: T.borderSoft }}>
                <div className="font-semibold" style={{ color: T.text }}>Priority access</div>
                <div className="mt-0.5" style={{ color: T.textFaint }}>Premium signals</div>
              </div>
              <div className="rounded-xl border px-2.5 py-2" style={{ background: T.card, borderColor: T.borderSoft }}>
                <div className="font-semibold" style={{ color: T.text }}>Instant activation</div>
                <div className="mt-0.5" style={{ color: T.textFaint }}>Ready to trade</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-5">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Monthly plan</div>
                  <div className="mt-1 font-mono text-lg font-semibold" style={{ color: T.teal }}>{fmtMoney(99)}<span className="ml-1 text-xs font-normal" style={{ color: T.textDim }}>/mo</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Yearly plan</div>
                  <div className="mt-1 font-mono text-lg font-semibold" style={{ color: T.teal }}>{fmtMoney(300)}<span className="ml-1 text-xs font-normal" style={{ color: T.textDim }}>/yr</span></div>
                </div>
              </div>
              <button onClick={() => openPaymentModal("subscribe")} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110" style={{ background: T.teal, color: "#04231F" }}>
                <Bot size={15} /> {subscription.active ? "Manage plan" : "Subscribe"}
              </button>
            </div>
          </div>
        </div>

        {!(["tools", "botting"] as TabKey[]).includes(tab) && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border p-2" style={{ background: T.card, borderColor: T.border }}>
            {[
              { id: "chart", label: "Chart", icon: TrendingUp },
              { id: "accounting", label: "User Activity", icon: User },
            ].map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button key={id} onClick={() => setTab(id as TabKey)} className="rounded-xl px-2 py-2 text-center text-sm font-medium transition" style={{ background: active ? T.tealSoft : "transparent", color: active ? T.teal : T.textDim }}>
                  <div className="mx-auto mb-1 flex justify-center"><Icon size={16} /></div>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 rounded-2xl border p-3" style={{ background: T.card, borderColor: T.border }}>
          {tab === "chart" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                  {SYMBOLS.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol}</option>)}
                </select>
                <Badge tone="teal">Live</Badge>
              </div>
              <div className="rounded-2xl border p-4" style={{ background: T.cardAlt, borderColor: T.border }}>
                <div className="h-[320px] overflow-hidden rounded-xl border border-border bg-background/70">
                  <iframe
                    key={`${selectedSymbol}-${botForm.timeframe}`}
                    src={getTradingViewUrl(selectedSymbol, botForm.timeframe)}
                    title={`${chartSpec.symbol} TradingView chart`}
                    className="h-full w-full border-0"
                    loading="lazy"
                  />
                </div>
              </div>
              <Panel>
                <div className="mb-3 section-kicker">Bot setup</div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Strategy</label>
                    <select value={botForm.strategyId} onChange={(event) => setBotForm((prev) => ({ ...prev, strategyId: event.target.value as StrategyId }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {Object.entries(STRATEGIES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
                    </select>
                    <div className="mt-2 flex items-center gap-2 text-sm leading-6" style={{ color: T.textDim }}>
                      <span>{STRATEGIES[botForm.strategyId].description}</span>
                      <button type="button" onClick={() => setDetailOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-full border" style={{ borderColor: T.border, color: T.text }} aria-label="More strategy info">
                        <Info size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Symbol</label>
                    <select value={botForm.symbol} onChange={(event) => setBotForm((prev) => ({ ...prev, symbol: event.target.value }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {SYMBOL_DEFS.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Timeframe</label>
                    <select value={botForm.timeframe} onChange={(event) => setBotForm((prev) => ({ ...prev, timeframe: event.target.value }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {['1m', '5m', '15m', '1h', '4h'].map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Check every (sec)</label>
                    <input type="number" min="5" value={botForm.checkSec} onChange={(event) => setBotForm((prev) => ({ ...prev, checkSec: Number(event.target.value) }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }} />
                  </div>
                </div>
                <button onClick={startBot} className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold" style={{ background: T.teal, color: "#04231F" }}><Play size={15} /> Start bot</button>
              </Panel>
              <Panel>
                <div className="mb-3 section-kicker">Live indicators</div>
                <div className="space-y-2.5">
                  <IndicatorBar label="Trend (EMA)" value={((current.indicators.ema12 - current.indicators.ema26) / current.indicators.ema26) * 1000} />
                  <IndicatorBar label="Momentum (RSI)" value={current.indicators.rsiVal - 50} />
                  <IndicatorBar label="Efficiency Ratio" value={current.indicators.er * 20} range={6} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <RegimeBadge regime={classifyRegime(current.indicators.er)} />
                  <span className="text-xs" style={{ color: T.textFaint }}>· ATR {fmt(current.indicators.atr, currentDef.decimals)}</span>
                </div>
              </Panel>
            </div>
          )}

          {tab === "botting" && (
            <div className="space-y-4">
              <Panel>
                <div className="mb-3 section-kicker">Bot setup</div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Strategy</label>
                    <select value={botForm.strategyId} onChange={(event) => setBotForm((prev) => ({ ...prev, strategyId: event.target.value as StrategyId }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {Object.entries(STRATEGIES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
                    </select>
                    <div className="mt-2 flex items-center gap-2 text-sm leading-6" style={{ color: T.textDim }}>
                      <span>{STRATEGIES[botForm.strategyId].description}</span>
                      <button type="button" onClick={() => setDetailOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-full border" style={{ borderColor: T.border, color: T.text }} aria-label="More strategy info">
                        <Info size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Symbol</label>
                    <select value={botForm.symbol} onChange={(event) => setBotForm((prev) => ({ ...prev, symbol: event.target.value }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {SYMBOL_DEFS.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Timeframe</label>
                    <select value={botForm.timeframe} onChange={(event) => setBotForm((prev) => ({ ...prev, timeframe: event.target.value }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                      {['1m', '5m', '15m', '1h', '4h'].map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Check every (sec)</label>
                    <input type="number" min="5" value={botForm.checkSec} onChange={(event) => setBotForm((prev) => ({ ...prev, checkSec: Number(event.target.value) }))} className="w-full rounded-lg border px-2.5 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }} />
                  </div>
                </div>
                <button onClick={startBot} className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold" style={{ background: T.teal, color: "#04231F" }}><Play size={15} /> Start bot</button>
              </Panel>

              <Panel>
                <button type="button" onClick={() => setManualOrderCollapsed((prev) => !prev)} className="mb-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition" style={{ background: "transparent", borderColor: T.border, color: T.textDim }}>
                  <div>
                    <div className="section-kicker">Manual order</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>
                      {manualOrderCollapsed ? "Tap to open" : "Tap to collapse"}
                    </div>
                  </div>
                  <div className="text-sm" style={{ color: T.textFaint }}>{manualOrderCollapsed ? "▸" : "▾"}</div>
                </button>
                {!manualOrderCollapsed && (
                  <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Choose the market and size before placing the trade</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Symbol</label>
                        <select value={tradeForm.symbol} onChange={(event) => setTradeForm((prev) => ({ ...prev, symbol: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }}>
                          {SYMBOL_DEFS.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Lot size</label>
                        <input type="number" step="0.01" min="0.01" value={tradeForm.lots} onChange={(event) => setTradeForm((prev) => ({ ...prev, lots: Number(event.target.value) }))} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }} />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Take profit</label>
                        <input type="number" step="0.01" min="0.01" placeholder="Optional" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Stop loss</label>
                        <input type="number" step="0.01" min="0.01" placeholder="Optional" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: T.cardAlt, borderColor: T.border, color: T.text }} />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button onClick={() => setTradeForm((prev) => ({ ...prev, dir: 1 }))} className="flex items-center justify-center gap-1 rounded-lg border py-2 text-sm font-semibold shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_0_18px_rgba(16,185,129,0.25)] animate-pulse" style={{ background: tradeForm.dir === 1 ? "rgba(16,185,129,0.18)" : T.cardAlt, borderColor: tradeForm.dir === 1 ? T.teal : T.border, color: tradeForm.dir === 1 ? T.teal : T.textDim }}><ArrowUp size={14} /> Buy</button>
                      <button onClick={() => setTradeForm((prev) => ({ ...prev, dir: -1 }))} className="flex items-center justify-center gap-1 rounded-lg border py-2 text-sm font-semibold shadow-[0_0_0_1px_rgba(248,113,113,0.2),0_0_18px_rgba(248,113,113,0.25)] animate-pulse" style={{ background: tradeForm.dir === -1 ? "rgba(248,113,113,0.18)" : T.cardAlt, borderColor: tradeForm.dir === -1 ? T.red : T.border, color: tradeForm.dir === -1 ? T.red : T.textDim }}><ArrowDown size={14} /> Sell</button>
                    </div>
                    <button onClick={openManualPosition} className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold" style={{ background: T.teal, color: "#04231F" }}><Plus size={16} /> Open position</button>
                  </div>
                )}
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between">
                  <div className="section-kicker">Open positions</div>
                  <Badge tone="gray">{positions.length}</Badge>
                </div>
                {positions.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-center text-sm" style={{ borderColor: T.border, color: T.textDim }}>
                    No live trades yet — open one manually or let a bot take a signal.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {positions.map((position) => {
                      const currentPosition = market[position.symbol];
                      const pnl = getPositionPnl(position, market);
                      const expanded = Boolean(expandedPositionIds[position.id]);
                      return (
                        <div key={position.id} className="rounded-xl border" style={{ background: T.cardAlt, borderColor: T.border }}>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 p-2.5">
                            <button type="button" onClick={() => setExpandedPositionIds((previous) => ({ ...previous, [position.id]: !expanded }))} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={expanded}>
                              {expanded ? <ChevronUp size={15} className="shrink-0" style={{ color: T.textFaint }} /> : <ChevronDown size={15} className="shrink-0" style={{ color: T.textFaint }} />}
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{position.symbol}</span>
                                <span className="block whitespace-nowrap text-[11px]" style={{ color: T.textFaint }}>
                                  <span className="font-semibold" style={{ color: position.dir === 1 ? T.teal : T.red }}>{position.dir === 1 ? "Buy" : "Sell"}</span>
                                  <span> · {position.lots} lot{position.lots === 1 ? "" : "s"}</span>
                                </span>
                              </span>
                            </button>
                            <span className="whitespace-nowrap font-mono text-xs font-semibold" style={{ color: pnl >= 0 ? T.teal : T.red }}>{pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}</span>
                            <button onClick={() => closePosition(position.id)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold" style={{ background: T.redSoft, color: T.red }}><X size={13} /> Close</button>
                          </div>
                          {expanded && (
                            <div className="grid gap-2 border-t px-3 py-2.5 text-xs sm:grid-cols-3" style={{ borderColor: T.borderSoft }}>
                              <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Entry</div><div className="mt-1 font-mono">{fmt(position.entry, getSymbolDef(position.symbol).decimals)}</div></div>
                              <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Current</div><div className="mt-1 font-mono">{fmt(currentPosition?.price ?? position.entry, getSymbolDef(position.symbol).decimals)}</div></div>
                              <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>P/L</div><div className="mt-1 font-mono" style={{ color: pnl >= 0 ? T.teal : T.red }}>{pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}</div></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between">
                  <div className="section-kicker">Trade History</div>
                  <Badge tone="gray">{closedTrades.length}</Badge>
                </div>
                {closedTrades.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-center text-sm" style={{ borderColor: T.border, color: T.textDim }}>
                    No closed trades yet — close a position to see it here.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {closedTrades.map((trade) => {
                      const pnl = trade.pnl || 0;
                      const closedDate = trade.closed_at ? new Date(trade.closed_at) : new Date();
                      const timeago = Math.floor((Date.now() - closedDate.getTime()) / 1000);
                      const timeStr = timeago < 60 ? `${timeago}s ago` : timeago < 3600 ? `${Math.floor(timeago / 60)}m ago` : `${Math.floor(timeago / 3600)}h ago`;
                      return (
                        <div key={trade.id} className="rounded-lg border p-3" style={{ background: T.cardAlt, borderColor: T.border }}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm">{trade.symbol}</span>
                                <span className="text-[10px] uppercase tracking-[0.1em] rounded px-1.5 py-0.5" style={{ background: trade.source === "bot" ? `${T.teal}20` : `${T.blue}20`, color: trade.source === "bot" ? T.teal : T.blue }}>
                                  {trade.source}
                                </span>
                              </div>
                              <div className="text-xs" style={{ color: T.textFaint }}>
                                <span className="font-semibold" style={{ color: trade.side === "buy" ? T.teal : T.red }}>{trade.side === "buy" ? "Buy" : "Sell"}</span>
                                <span> · {trade.volume || trade.lots} lot{(trade.volume || trade.lots) === 1 ? "" : "s"}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono text-sm font-semibold" style={{ color: pnl >= 0 ? T.teal : T.red }}>
                                {pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}
                              </div>
                              <div className="text-[10px]" style={{ color: T.textFaint }}>{timeStr}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 border-t pt-2 text-[11px]" style={{ borderColor: T.borderSoft }}>
                            <div><div style={{ color: T.textFaint }}>Entry</div><div className="font-mono text-xs mt-0.5">{fmt(trade.entry_price, getSymbolDef(trade.symbol).decimals)}</div></div>
                            <div><div style={{ color: T.textFaint }}>Exit</div><div className="font-mono text-xs mt-0.5">{fmt(trade.exit_price || 0, getSymbolDef(trade.symbol).decimals)}</div></div>
                            <div><div style={{ color: T.textFaint }}>Outcome</div><div className="capitalize text-xs mt-0.5 font-semibold" style={{ color: trade.outcome_mode === "profit" ? T.teal : trade.outcome_mode === "loss" ? T.red : T.textFaint }}>{trade.outcome_mode}</div></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <div className="space-y-3">
                {bots.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center" style={{ borderColor: T.border, color: T.textDim }}>
                    <div className="mb-2 flex justify-center"><Bot size={20} /></div>
                    No bots running
                  </div>
                ) : bots.map((bot) => {
                  const currentBot = market[bot.symbol];
                  const signal = bot.lastSignal;
                  const regime = signal ? signal.regime : classifyRegime(currentBot.indicators.er);
                  const secondsLeft = Math.max(0, bot.checkSec - Math.floor(bot.elapsed / 1000));
                  return (
                    <div key={bot.id} className="overflow-hidden rounded-2xl border" style={{ background: T.cardAlt, borderColor: T.border }}>
                      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: T.borderSoft }}>
                        <div className="flex items-center gap-2">
                          <Circle size={8} fill={bot.running ? T.teal : T.textFaint} style={{ color: bot.running ? T.teal : T.textFaint }} />
                          <span className="font-semibold">{bot.symbol}</span>
                          <span className="text-xs" style={{ color: T.textFaint }}>· {STRATEGIES[bot.strategyId].label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {signal && <ActionBadge action={signal.action} />}
                          <RegimeBadge regime={regime} />
                        </div>
                      </div>
                      <div className="grid gap-2 border-b p-4 text-center text-sm sm:grid-cols-4" style={{ borderColor: T.borderSoft }}>
                        <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Price</div><div className="mt-1 font-mono font-semibold">{fmt(currentBot.price, getSymbolDef(bot.symbol).decimals)}</div></div>
                        <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Timeframe</div><div className="mt-1 font-mono font-semibold">{bot.timeframe}</div></div>
                        <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Confidence</div><div className="mt-1 font-mono font-semibold" style={{ color: T.teal }}>{signal ? `${signal.confidence}%` : "—"}</div></div>
                        <div><div className="text-[10px] uppercase" style={{ color: T.textFaint }}>Next</div><div className="mt-1 font-mono font-semibold">{bot.running ? `${secondsLeft}s` : "paused"}</div></div>
                      </div>
                      <div className="border-b p-4" style={{ borderColor: T.borderSoft }}>
                        <div className="mb-2 section-kicker">Signal reasoning</div>
                        <div className="rounded-lg border p-2.5 text-xs leading-relaxed" style={{ background: T.card, borderColor: T.border, color: T.textDim }}>
                          {signal ? signal.reason : "Waiting for the first check to compute EMA, RSI, and Efficiency Ratio from live ticks…"}
                        </div>
                        <div className="mt-3 space-y-2">
                          <IndicatorBar label="Trend (EMA)" value={((currentBot.indicators.ema12 - currentBot.indicators.ema26) / currentBot.indicators.ema26) * 1000} />
                          <IndicatorBar label="Momentum (RSI)" value={currentBot.indicators.rsiVal - 50} />
                          <IndicatorBar label="Regime (ER)" value={currentBot.indicators.er * 20} range={6} />
                        </div>
                      </div>
                      <div className="border-b p-4" style={{ borderColor: T.borderSoft }}>
                        <div className="mb-2 text-[11px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Confidence history</div>
                        <Sparkline data={bot.confHistory.length ? bot.confHistory : [{ v: 50 }, { v: 50 }]} color={T.teal} />
                      </div>
                      <div className="p-4">
                        <div className="mb-2 flex items-center gap-1.5">
                          <span className="text-base">🧠</span>
                          <span className="section-kicker">Ask the model</span>
                        </div>
                        <div className="mb-3 flex gap-2">
                          <input value={askText} onChange={(event) => setAskText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && askModel(bot)} placeholder="Ask why HOLD or BUY…" className="flex-1 rounded-lg border px-3 py-2 text-xs" style={{ background: T.card, borderColor: T.border, color: T.text }} />
                          <button onClick={() => askModel(bot)} className="rounded-lg p-2" style={{ background: T.tealSoft, color: T.teal }}><Send size={14} /></button>
                        </div>
                        {bot.decisions.length > 0 && <div className="space-y-1.5 text-[11px]">{bot.decisions.map((decision, index) => <div key={index} className="flex gap-2"><span className="shrink-0 font-mono" style={{ color: T.textFaint }}>{new Date(decision.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span><span className="shrink-0 font-semibold" style={{ color: decision.action === "BUY" ? T.teal : decision.action === "SELL" ? T.red : decision.action === "ASK" ? T.blue : T.textDim }}>{decision.action === "ASK" ? `Q: ${decision.q}` : decision.action}</span><span className="truncate" style={{ color: T.textDim }}>{decision.reason}</span></div>)}</div>}
                      </div>
                      <div className="flex gap-2 border-t p-3" style={{ borderColor: T.borderSoft }}>
                        {bot.running ? <button onClick={() => stopBot(bot.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold" style={{ background: T.redSoft, color: T.red }}><Square size={14} /> Stop</button> : <button onClick={() => removeBot(bot.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold" style={{ background: T.card, color: T.textDim, border: `1px solid ${T.border}` }}><Trash2 size={14} /> Remove</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "accounting" && (
            <div className="space-y-4">
              <Panel>
                <div className="mb-3 section-kicker">Users Account Details</div>
                {[
                  ["Account ID", "DEMO-100294"],
                  ["Currency", "USD"],
                  ["Leverage", `1:${LEVERAGE}`],
                  ["Balance", fmtMoney(balance)],
                  ["Equity", fmtMoney(equity)],
                  ["Used margin", fmtMoney(usedMargin)],
                  ["Free margin", fmtMoney(freeMargin)],
                  ["Open positions", positions.length],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b py-2 text-sm" style={{ borderColor: T.borderSoft }}><span style={{ color: T.textDim }}>{label}</span><span className="font-mono font-semibold">{value}</span></div>)}
              </Panel>
              <Panel>
                <div className="mb-3 section-kicker">Activity</div>
                <div className="space-y-2 text-xs">
                  {activity.map((item, index) => <div key={index} className="flex gap-2"><span className="shrink-0 font-mono" style={{ color: T.textFaint }}>{new Date(item.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span><span style={{ color: item.kind === "buy" ? T.teal : item.kind === "sell" ? T.red : T.textDim }}>{item.text}</span></div>)}
                </div>
              </Panel>
            </div>
          )}

          {tab === "tools" && (
            <div className="space-y-4">
              <Panel>
                <div className="mb-3 section-kicker">Trading tools</div>
                <div className="rounded-2xl border p-4" style={{ background: T.cardAlt, borderColor: T.border }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Current account</div>
                      <div className="mt-1 text-sm" style={{ color: T.textDim }}>
                        {subscription.active ? `${subscription.plan} · ${fmtMoney(subscription.amount)}/mo` : "Starter plan · no active bot subscription"}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ background: T.tealSoft, borderColor: T.border, color: T.teal }}>
                      {subscription.active ? "Active" : "Basic"}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[["Balance", fmtMoney(balance)], ["Equity", fmtMoney(equity)], ["Margin", fmtMoney(usedMargin)], ["Free", fmtMoney(freeMargin)]].map(([label, value]) => (
                      <div key={label} className="rounded-xl border px-2.5 py-2" style={{ background: T.card, borderColor: T.borderSoft }}>
                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: T.textFaint }}>{label}</div>
                        <div className="mt-1 truncate font-mono text-xs font-semibold" style={{ color: T.text }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border p-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] transition-all duration-200 hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${T.card} 0%, ${T.cardAlt} 100%)`, borderColor: T.border }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>
                            <Bot size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold">Subscribe for bot</div>
                              <div className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>Premium</div>
                            </div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: T.textDim }}>Unlock premium automation and richer signals for {fmtMoney(99)}.</div>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: T.tealSoft, borderColor: `${T.teal}33`, color: T.teal }}>Pro</div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[11px]" style={{ borderColor: T.borderSoft }}>
                        <div className="rounded-xl border px-2.5 py-2" style={{ background: T.card, borderColor: T.borderSoft }}>
                          <div className="font-semibold" style={{ color: T.text }}>Priority access</div>
                          <div className="mt-0.5" style={{ color: T.textFaint }}>Premium signals</div>
                        </div>
                        <div className="rounded-xl border px-2.5 py-2" style={{ background: T.card, borderColor: T.borderSoft }}>
                          <div className="font-semibold" style={{ color: T.text }}>Instant activation</div>
                          <div className="mt-0.5" style={{ color: T.textFaint }}>Ready to trade</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-5">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Monthly plan</div>
                            <div className="mt-1 font-mono text-lg font-semibold" style={{ color: T.teal }}>{fmtMoney(99)}<span className="ml-1 text-xs font-normal" style={{ color: T.textDim }}>/mo</span></div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>Yearly plan</div>
                            <div className="mt-1 font-mono text-lg font-semibold" style={{ color: T.teal }}>{fmtMoney(300)}<span className="ml-1 text-xs font-normal" style={{ color: T.textDim }}>/yr</span></div>
                          </div>
                        </div>
                        <button onClick={() => openPaymentModal("subscribe")} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110" style={{ background: T.teal, color: "#04231F" }}>
                          <Bot size={15} /> Subscribe
                        </button>
                      </div>
                    </div>

                    <div className="group rounded-2xl border p-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] transition-all duration-200 hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${T.card} 0%, ${T.cardAlt} 100%)`, borderColor: T.border }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border" style={{ background: T.amberSoft, borderColor: `${T.amber}33`, color: T.amber }}>
                            <Plus size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold">Top up to trade</div>
                              <div className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: T.amberSoft, borderColor: `${T.amber}33`, color: T.amber }}>Fast</div>
                            </div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: T.textDim }}>Add {fmtMoney(500)} to keep your account funded for live trading.</div>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: T.amberSoft, borderColor: `${T.amber}33`, color: T.amber }}>Instant</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: T.borderSoft }}>
                        <div className="text-[11px]" style={{ color: T.textDim }}><span className="font-semibold" style={{ color: T.text }}>Low friction</span><span className="block text-[10px]" style={{ color: T.textFaint }}>Same-day credit</span></div>
                        <button onClick={() => openPaymentModal("topup")} className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:brightness-110" style={{ background: T.amber, color: "#2B1700" }}><ArrowUp size={14} /> Top up</button>
                      </div>
                    </div>

                    <div className="group rounded-2xl border p-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] transition-all duration-200 hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${T.card} 0%, ${T.cardAlt} 100%)`, borderColor: T.border }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border" style={{ background: T.redSoft, borderColor: `${T.red}33`, color: T.red }}>
                            <ArrowDown size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold">Withdraw</div>
                              <div className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: T.redSoft, borderColor: `${T.red}33`, color: T.red }}>Secure</div>
                            </div>
                            <div className="mt-1 text-xs leading-relaxed" style={{ color: T.textDim }}>Withdraw {fmtMoney(250)} with protected wallet confirmation.</div>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: T.redSoft, borderColor: `${T.red}33`, color: T.red }}>Protected</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: T.borderSoft }}>
                        <div className="text-[11px]" style={{ color: T.textDim }}><span className="font-semibold" style={{ color: T.text }}>Verified wallet</span><span className="block text-[10px]" style={{ color: T.textFaint }}>Protected flow</span></div>
                        <button onClick={() => openPaymentModal("withdraw")} className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:brightness-110" style={{ background: T.red, color: "#260808" }}><ArrowDown size={14} /> Withdraw</button>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="mb-3 section-kicker">Engine details</div>
                {[["Tick interval", `${TICK_MS} ms`], ["Leverage", `1:${LEVERAGE}`], ["Symbols", SYMBOL_DEFS.map((item) => item.id).join(", ")]].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b py-2 text-sm" style={{ borderColor: T.borderSoft }}><span style={{ color: T.textDim }}>{label}</span><span className="font-mono">{value}</span></div>)}
              </Panel>

              <Panel>
                <div className="mb-3 flex items-center justify-between">
                  <div className="section-kicker">Request history</div>
                  <div className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ background: T.tealSoft, borderColor: T.border, color: T.teal }}>
                    Pending
                  </div>
                </div>
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border p-3" style={{ background: T.cardAlt, borderColor: T.border }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{request.title}</div>
                          {request.amount !== undefined && <div className="mt-1 text-xs" style={{ color: T.textDim }}>{fmtMoney(request.amount)}</div>}
                          {request.network && <div className="mt-1 text-xs" style={{ color: T.textDim }}>Network: {request.network}</div>}
                          {request.address && <div className="mt-1 text-xs" style={{ color: T.textDim }}>Address: {request.address}</div>}
                          <div className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: T.textFaint }}>{new Date(request.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ background: request.status === "Pending" ? T.tealSoft : request.status === "Approved" ? T.greenSoft : T.amberSoft, borderColor: T.border, color: request.status === "Pending" ? T.teal : request.status === "Approved" ? T.green : T.amber }}>
                          {request.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
      <StrategyDetailsModal strategy={STRATEGIES[botForm.strategyId]} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </main>
  );
}
