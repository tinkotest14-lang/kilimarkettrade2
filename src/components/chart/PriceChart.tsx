import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/feed";

interface Props {
  candles: Candle[];
  last: Candle | null;
  digits: number;
  showGrid?: boolean;
  showVolume?: boolean;
  showCrosshair?: boolean;
}

export function PriceChart({ candles, last, digits, showGrid = true, showVolume = true, showCrosshair = true }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!holder.current) return;
    const chart = createChart(holder.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#93a1ad", attributionLogo: false },
      grid: {
        vertLines: { color: showGrid ? "rgba(255,255,255,0.04)" : "transparent" },
        horzLines: { color: showGrid ? "rgba(255,255,255,0.04)" : "transparent" },
      },
      crosshair: { mode: showCrosshair ? 1 : 2 },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: "#22a58a",
      downColor: "#ef4a4a",
      borderVisible: false,
      wickUpColor: "#9aa7b2",
      wickDownColor: "#9aa7b2",
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
    });
    chartRef.current = chart;
    priceRef.current = price;

    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volRef.current = vol;
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    };
  }, [digits, showGrid, showVolume, showCrosshair]);

  useEffect(() => {
    if (!priceRef.current || candles.length === 0) return;
    priceRef.current.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    volRef.current?.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,165,138,0.45)" : "rgba(239,74,74,0.45)",
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!last || !priceRef.current) return;
    priceRef.current.update({
      time: last.time as UTCTimestamp,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    });
    volRef.current?.update({
      time: last.time as UTCTimestamp,
      value: last.volume,
      color: last.close >= last.open ? "rgba(34,165,138,0.45)" : "rgba(239,74,74,0.45)",
    });
  }, [last]);

  return <div ref={holder} className="h-full w-full" />;
}
