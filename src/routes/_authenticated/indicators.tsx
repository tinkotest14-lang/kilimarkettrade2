import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/indicators")({
  head: () => ({
    meta: [
      { title: "Indicators \u00b7 KiliMarkets" },
      { name: "description", content: "Enable and tune moving averages, oscillators, volatility and volume studies." },
      { property: "og:title", content: "Indicators \u00b7 KiliMarkets" },
      { property: "og:description", content: "Enable and tune technical studies on your charts." },
    ],
  }),
  component: IndicatorsPage,
});

const CATALOG: { category: string; items: string[] }[] = [
  { category: "Trend", items: ["SMA", "EMA", "WMA", "HMA", "VWMA", "DEMA", "TEMA", "ALMA", "Ichimoku", "Parabolic SAR", "SuperTrend"] },
  { category: "Momentum", items: ["RSI", "MACD", "ADX", "CCI", "Stochastic"] },
  { category: "Volatility", items: ["ATR", "Bollinger Bands", "Keltner Channel", "Donchian Channel", "Standard Deviation"] },
  { category: "Volume", items: ["VWAP", "OBV", "MFI", "Chaikin Money Flow"] },
];

function IndicatorsPage() {
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () =>
      CATALOG.map((group) => ({
        ...group,
        items: group.items.filter((i) => i.toLowerCase().includes(query.toLowerCase())),
      })).filter((g) => g.items.length > 0),
    [query],
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-2xl font-bold">Indicators</h1>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search indicators"
          aria-label="Search indicators"
          className="h-12 rounded-xl bg-surface pl-9"
        />
      </div>

      {filtered.map((group) => (
        <section key={group.category} className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.category}</h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {group.items.map((item) => (
              <li key={item} className="flex items-center justify-between px-4 py-3.5">
                <span className="font-medium">{item}</span>
                <Switch
                  checked={Boolean(enabled[item])}
                  onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [item]: v }))}
                  aria-label={`Toggle ${item}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
