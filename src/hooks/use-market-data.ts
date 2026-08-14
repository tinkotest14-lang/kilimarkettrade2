import { useEffect, useState } from "react";
import {
  fetchCandles,
  fetchTicker,
  marketSocket,
  subscribeCandles,
  subscribeTicker,
  type Candle,
  type FeedStatus,
  type Ticker,
} from "@/lib/market/feed";
import type { Timeframe } from "@/lib/market/symbols";

export function useFeedStatus(): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>(marketSocket.status);
  useEffect(() => marketSocket.onStatus(setStatus), []);
  return status;
}

export function useCandles(symbol: string, timeframe: Timeframe) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [live, setLive] = useState<Candle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCandles([]);
    setLive(null);
    setError(null);
    fetchCandles(symbol, timeframe, 500)
      .then((data) => {
        if (cancelled) return;
        setCandles(data);
        setLive(data.at(-1) ?? null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    const unsubscribe = subscribeCandles(symbol, timeframe, (candle) => {
      setLive(candle);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [symbol, timeframe]);

  return { candles, live, loading, error };
}

export function useTicker(symbol: string) {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchTicker(symbol)
      .then((t) => !cancelled && setTicker(t))
      .catch(() => undefined);
    const unsubscribe = subscribeTicker(symbol, setTicker);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [symbol]);
  return ticker;
}
