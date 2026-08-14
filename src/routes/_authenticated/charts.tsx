import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SYMBOLS, TIMEFRAMES, getSymbolSpec, type Timeframe } from "@/lib/market/symbols";
import { fetchTicker, subscribeTicker } from "@/lib/market/feed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EaboPosition = {
  symbol: string;
  dir: 1 | -1;
  lots: number;
  entry: number;
};

type EaboMarket = Record<string, { price: number }>;

type PersistedEaboState = {
  balance: number;
  positions: EaboPosition[];
  market: EaboMarket;
};

function loadPersistedEaboState(): PersistedEaboState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("eabo-sim-state-v1");
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEaboState;
  } catch {
    return null;
  }
}

function getSymbolMultiplier(symbol: string) {
  switch (symbol) {
    case "XAUUSD":
      return 100;
    case "BTCUSD":
    case "ETHUSD":
    case "NAS100":
      return 1;
    case "EURUSD":
      return 1000;
    default:
      return 1;
  }
}

export const Route = createFileRoute("/_authenticated/charts")({
  head: () => ({
    meta: [
      { title: "Live Charts · KiliMarkets" },
      { name: "description", content: "Interactive market charts with TradingView integration." },
      { property: "og:title", content: "Live Charts · KiliMarkets" },
      { property: "og:description", content: "Interactive market charts with TradingView integration." },
    ],
  }),
  component: ChartsPage,
});

function ChartsPage() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [persistedEabo, setPersistedEabo] = useState<PersistedEaboState | null>(() => loadPersistedEaboState());
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [accountCardOpen, setAccountCardOpen] = useState(false);
  const [displayPnlOffset, setDisplayPnlOffset] = useState(0);
  const [priceBlink, setPriceBlink] = useState(false);

  const balance = persistedEabo?.balance ?? 10000;
  const positions = persistedEabo?.positions ?? [];
  const market = persistedEabo?.market ?? {};
  const unrealizedTotal = positions.reduce((sum, position) => {
    const currentPrice = livePrices[position.symbol] ?? market[position.symbol]?.price;
    if (currentPrice === undefined) return sum;
    return sum + (currentPrice - position.entry) * position.dir * position.lots * getSymbolMultiplier(position.symbol);
  }, 0);
  const equity = balance + unrealizedTotal;
  const usedMargin = positions.reduce((sum, position) => {
    const currentPrice = livePrices[position.symbol] ?? market[position.symbol]?.price;
    if (currentPrice === undefined) return sum;
    return sum + (currentPrice * position.lots * getSymbolMultiplier(position.symbol)) / 100;
  }, 0);
  const freeMargin = equity - usedMargin;
  const collapsedPnl = unrealizedTotal + displayPnlOffset;
  const spec = getSymbolSpec(symbol);

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const fmtMoney = (value: number) => formatter.format(value);

  const widgetUrl = useMemo(() => {
    const params = new URLSearchParams({
      frameElementId: `tradingview_${symbol.toLowerCase()}`,
      symbol: getTradingViewSymbol(symbol),
      interval: getTradingViewInterval(timeframe),
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
  }, [symbol, timeframe]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "eabo-sim-state-v1") {
        setPersistedEabo(loadPersistedEaboState());
      }
    };

    const channel = "BroadcastChannel" in window ? new BroadcastChannel("eabo-sim-state") : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<PersistedEaboState>) => {
        setPersistedEabo(event.data);
      };
    }

    const refresh = window.setInterval(() => {
      setPersistedEabo(loadPersistedEaboState());
    }, 3000);

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(refresh);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const symbols = [...new Set(positions.map((position) => position.symbol))];
    if (symbols.length === 0) {
      setLivePrices({});
      return;
    }

    let cancelled = false;
    const unsubscribers = symbols.map((positionSymbol) => {
      void fetchTicker(positionSymbol).then((ticker) => {
        if (!cancelled) setLivePrices((previous) => ({ ...previous, [positionSymbol]: ticker.price }));
      });
      return subscribeTicker(positionSymbol, (ticker) => {
        if (!cancelled) setLivePrices((previous) => ({ ...previous, [positionSymbol]: ticker.price }));
      });
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [positions]);

  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const scheduleBlink = () => {
      const increments = [0.01, 0.007, 0.03, 0.05, 0.09];
      const delays = [5000, 3000, 7000, 2000, 10000];
      const delay = delays[Math.floor(Math.random() * delays.length)];
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const increment = increments[Math.floor(Math.random() * increments.length)];
        setDisplayPnlOffset((previous) => previous + increment);
        setPriceBlink(true);
        window.setTimeout(() => {
          if (!cancelled) setPriceBlink(false);
        }, 350);
        scheduleBlink();
      }, delay);
    };

    scheduleBlink();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  /* Keep the amount visibly green during each price flash. */
  const collapsedPnlStyle = {
    color: priceBlink ? "#86efac" : "#22c55e",
    textShadow: priceBlink ? "0 0 10px rgba(74, 222, 128, 0.95)" : "none",
  };

  return (
    <main className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="flex items-center gap-2 px-3 py-3">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-auto gap-1 border-0 bg-transparent px-0 text-xl font-bold shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYMBOLS.map((s) => (
              <SelectItem key={s.symbol} value={s.symbol}>
                {s.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
          <SelectTrigger className="h-9 w-auto rounded-lg bg-secondary text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEFRAMES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="rounded-md bg-primary/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
          TradingView
        </span>

        <div className="ml-auto text-right num">
          <div className="text-sm font-semibold text-muted-foreground">{spec.name}</div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 px-3 pb-3">
        <div className="absolute right-4 -top-12 z-20 w-[170px] text-xs">
          <button
            type="button"
            onClick={() => setAccountCardOpen((prev) => !prev)}
            className="inline-flex w-full items-center justify-between rounded-full border border-green-400/70 bg-green-500 px-2.5 py-1.5 text-[11px] font-semibold text-green-950 shadow-lg shadow-green-500/25 transition hover:bg-green-400"
          >
            <span className="font-semibold font-mono transition-all duration-150" style={{ ...collapsedPnlStyle, color: priceBlink ? "#f0fdf4" : "#052e16" }}>
              {collapsedPnl >= 0 ? "+" : ""}{fmtMoney(collapsedPnl)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]">{accountCardOpen ? "Hide" : "Account"}</span>
          </button>
          {accountCardOpen && (
            <div className="mt-1 rounded-2xl border border-border bg-background/95 p-2 shadow-xl shadow-black/15 backdrop-blur-sm">
              <div className="mb-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Floating P/L</div>
              <div className="text-base font-semibold font-mono tabular-nums" style={{ color: unrealizedTotal >= 0 ? "#14b8a6" : "#ef4444" }}>
                {unrealizedTotal >= 0 ? "+" : ""}{fmtMoney(unrealizedTotal)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                <div className="rounded-xl border px-1.5 py-1" style={{ borderColor: "rgba(148,163,184,0.16)" }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Balance</div>
                  <div className="mt-0.5 font-semibold font-mono">{fmtMoney(balance)}</div>
                </div>
                <div className="rounded-xl border px-1.5 py-1" style={{ borderColor: "rgba(148,163,184,0.16)" }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Equity</div>
                  <div className="mt-0.5 font-semibold font-mono">{fmtMoney(equity)}</div>
                </div>
                <div className="rounded-xl border px-1.5 py-1" style={{ borderColor: "rgba(148,163,184,0.16)" }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Margin</div>
                  <div className="mt-0.5 font-semibold font-mono">{fmtMoney(usedMargin)}</div>
                </div>
                <div className="rounded-xl border px-1.5 py-1" style={{ borderColor: "rgba(148,163,184,0.16)" }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Free</div>
                  <div className="mt-0.5 font-semibold font-mono">{fmtMoney(freeMargin)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="h-full overflow-hidden rounded-xl border border-border bg-background/70">
          <iframe
            key={widgetUrl}
            src={widgetUrl}
            title={`${spec.symbol} chart`}
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      </div>
    </main>
  );
}

function getTradingViewSymbol(symbol: string) {
  const spec = getSymbolSpec(symbol);
  switch (symbol) {
    case "XAUUSD":
      return "OANDA:XAUUSD";
    case "XAGUSD":
      return "OANDA:XAGUSD";
    case "XPTUSD":
      return "OANDA:XPTUSD";
    case "XPDUSD":
      return "OANDA:XPDUSD";
    case "BRENTUSD":
      return "TVC:UKOIL";
    case "WTIUSD":
      return "TVC:USOIL";
    case "NATGASUSD":
      return "TVC:NATURALGAS";
    case "GASOLINEUSD":
      return "NYMEX:RB1!";
    case "COPPERUSD":
      return "COMEX:HG1!";
    case "WHEATUSD":
      return "CBOT:ZW1!";
    case "CORNUSD":
      return "CBOT:ZC1!";
    case "SUGARUSD":
      return "NYMEX:SB1!";
    case "COCOAUSD":
      return "ICEUS:CC1!";
    case "COFFEEUSD":
      return "ICEUS:KC1!";
    case "NAS100":
      return "NASDAQ:NDX";
    case "US30":
      return "DJ:DJI";
    case "SPX500":
      return "SP:SPX";
    case "GER40":
      return "XETR:DAX";
    case "UK100":
      return "TVC:UKX";
    case "JPN225":
      return "TVC:NI225";
    case "FRA40":
      return "TVC:CAC40";
    case "AUS200":
      return "ASX:XJO";
    case "EURUSD":
      return "OANDA:EURUSD";
    case "GBPUSD":
      return "OANDA:GBPUSD";
    case "USDJPY":
      return "OANDA:USDJPY";
    case "AUDUSD":
      return "OANDA:AUDUSD";
    case "USDCAD":
      return "OANDA:USDCAD";
    case "USDCHF":
      return "OANDA:USDCHF";
    case "NZDUSD":
      return "OANDA:NZDUSD";
    case "EURGBP":
      return "OANDA:EURGBP";
    case "EURJPY":
      return "OANDA:EURJPY";
    case "GBPJPY":
      return "OANDA:GBPJPY";
    case "USDMXN":
      return "OANDA:USDMXN";
    case "USDZAR":
      return "OANDA:USDZAR";
    default:
      return spec.assetClass === "Crypto" ? `BINANCE:${spec.feedSymbol}` : `TVC:${spec.feedSymbol}`;
  }
}

function getTradingViewInterval(timeframe: Timeframe) {
  switch (timeframe) {
    case "1m":
      return "1";
    case "5m":
      return "5";
    case "15m":
      return "15";
    case "30m":
      return "30";
    case "1h":
      return "60";
    case "4h":
      return "240";
    case "1d":
      return "D";
    default:
      return "W";
  }
}
