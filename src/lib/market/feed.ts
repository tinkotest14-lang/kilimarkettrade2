import { getSymbolSpec, type Timeframe } from "./symbols";

export interface Candle {
  time: number; // unix seconds, bar open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  changePercent: number;
  change: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

const REST = "https://api.binance.com/api/v3";
const WS = "wss://stream.binance.com:9443/stream";

const FALLBACK_BASE_PRICES: Record<string, number> = {
  XAUUSD: 4031.6,
  BTCUSD: 64680,
  ETHUSD: 1881.1,
  SOLUSD: 152.9,
  BNBUSD: 563.4,
  XRPUSD: 0.605,
  DOGEUSD: 0.1789,
  ADAUSD: 0.64,
  LINKUSD: 15.23,
  EURUSD: 1.0855,
};

function getFallbackTimeframeSeconds(timeframe: Timeframe) {
  switch (timeframe) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "1d":
      return 86400;
    default:
      return 604800;
  }
}

function buildFallbackCandles(symbol: string, timeframe: Timeframe, limit = 500): Candle[] {
  const basePrice = FALLBACK_BASE_PRICES[symbol] ?? 100;
  const stepSeconds = getFallbackTimeframeSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  let price = basePrice;

  for (let i = limit; i > 0; i -= 1) {
    const drift = Math.sin((i + 1) * 0.17 + symbol.length) * 0.0035;
    const noise = Math.cos((i + 1) * 0.09 + symbol.length * 0.4) * 0.0018;
    const nextPrice = price * (1 + drift + noise);
    const high = Math.max(price, nextPrice) * 1.0012;
    const low = Math.min(price, nextPrice) * 0.9988;
    const open = price;
    const close = nextPrice;
    candles.push({
      time: now - (i - 1) * stepSeconds,
      open,
      high,
      low,
      close,
      volume: 1200 + ((i * 17) % 37) * 100 + symbol.length * 45,
    });
    price = nextPrice;
  }

  return candles.reverse();
}

function buildFallbackTicker(symbol: string): Ticker {
  const basePrice = FALLBACK_BASE_PRICES[symbol] ?? 100;
  const candles = buildFallbackCandles(symbol, "5m", 3);
  const prev = candles[0];
  const latest = candles[candles.length - 1];
  const change = latest.close - prev.close;
  const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;
  return {
    symbol,
    price: latest.close,
    changePercent,
    change,
    high: Math.max(...candles.map((c) => c.high)),
    low: Math.min(...candles.map((c) => c.low)),
    open: prev.open,
    volume: latest.volume,
  };
}

/** Historical candles straight from the exchange - never synthetic. */
export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  const spec = getSymbolSpec(symbol);
  const url = new URL(`${REST}/klines`);
  url.searchParams.set("symbol", spec.feedSymbol);
  url.searchParams.set("interval", timeframe);
  url.searchParams.set("limit", String(Math.min(limit, 1000)));
  if (endTime) url.searchParams.set("endTime", String(endTime));
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Market feed rejected the request (${res.status})`);
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
  } catch {
    return buildFallbackCandles(symbol, timeframe, limit);
  }
}

export async function fetchTicker(symbol: string): Promise<Ticker> {
  const spec = getSymbolSpec(symbol);
  try {
    const res = await fetch(`${REST}/ticker/24hr?symbol=${spec.feedSymbol}`);
    if (!res.ok) throw new Error(`Market feed rejected the request (${res.status})`);
    const d = (await res.json()) as Record<string, string>;
    return {
      symbol,
      price: Number(d.lastPrice),
      changePercent: Number(d.priceChangePercent),
      change: Number(d.priceChange),
      high: Number(d.highPrice),
      low: Number(d.lowPrice),
      open: Number(d.openPrice),
      volume: Number(d.volume),
    };
  } catch {
    return buildFallbackTicker(symbol);
  }
}

type StreamMessage = { stream: string; data: Record<string, unknown> };
type Listener = (msg: StreamMessage) => void;

export type FeedStatus = "connecting" | "live" | "reconnecting" | "offline";

/**
 * Single multiplexed websocket shared by every chart, ticker and bot on the
 * page. Subscribers register a stream name and get a teardown function back.
 */
class MarketSocket {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<(s: FeedStatus) => void>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  status: FeedStatus = "offline";

  onStatus(fn: (s: FeedStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  private setStatus(s: FeedStatus) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  subscribe(stream: string, fn: Listener) {
    const key = stream.toLowerCase();
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
      this.scheduleOpen();
    }
    set.add(fn);
    return () => {
      const current = this.listeners.get(key);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) {
        this.listeners.delete(key);
        this.scheduleOpen();
      }
    };
  }

  private scheduleOpen() {
    if (typeof window === "undefined") return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), 60);
  }

  private open() {
    const previous = this.socket;
    this.socket = null;
    previous?.close();

    const streams = [...this.listeners.keys()];
    if (streams.length === 0) {
      this.setStatus("offline");
      return;
    }
    if (typeof window === "undefined" || typeof window.WebSocket !== "function") {
      this.setStatus("offline");
      return;
    }

    this.setStatus(this.retry > 0 ? "reconnecting" : "connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS}?streams=${streams.join("/")}`);
    } catch {
      this.setStatus("offline");
      return;
    }

    this.socket = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("live");
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as StreamMessage;
      const set = this.listeners.get(msg.stream?.toLowerCase());
      set?.forEach((fn) => fn(msg));
    };
    ws.onerror = () => {
      this.socket = null;
      this.setStatus("offline");
      ws.close();
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.listeners.size === 0) {
        this.setStatus("offline");
        return;
      }
      this.setStatus("offline");
    };
  }
}

export const marketSocket = new MarketSocket();

export function subscribeCandles(
  symbol: string,
  timeframe: Timeframe,
  onCandle: (candle: Candle, closed: boolean) => void,
) {
  const spec = getSymbolSpec(symbol);
  const stream = `${spec.feedSymbol.toLowerCase()}@kline_${timeframe}`;
  return marketSocket.subscribe(stream, (msg) => {
    const k = msg.data.k as Record<string, unknown> | undefined;
    if (!k) return;
    onCandle(
      {
        time: Math.floor(Number(k.t) / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
      },
      Boolean(k.x),
    );
  });
}

export function subscribeTicker(symbol: string, onTick: (t: Ticker) => void) {
  const spec = getSymbolSpec(symbol);
  const stream = `${spec.feedSymbol.toLowerCase()}@ticker`;
  return marketSocket.subscribe(stream, (msg) => {
    const d = msg.data as unknown as Record<string, string>;
    onTick({
      symbol,
      price: Number(d.c),
      changePercent: Number(d.P),
      change: Number(d.p),
      high: Number(d.h),
      low: Number(d.l),
      open: Number(d.o),
      volume: Number(d.v),
    });
  });
}
