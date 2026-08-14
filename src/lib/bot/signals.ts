import type { Candle } from "../market/feed";
import { adx, atr, bollinger, donchian, ema, rsi } from "../indicators";

export type Side = "buy" | "sell";

export interface SignalResult {
  side: Side | null;
  reason: string;
  atr: number;
  price: number;
}

type Params = Record<string, number>;

const last = <T,>(arr: T[]): T => arr[arr.length - 1];
const at = (s: (number | null)[], i: number) => s[i];

function baseContext(candles: Candle[], params: Params) {
  const closes = candles.map((c) => c.close);
  const i = candles.length - 1;
  const range = atr(candles, 14);
  return {
    i,
    closes,
    price: last(candles).close,
    atrValue: (at(range, i) ?? 0) as number,
    trend: ema(closes, Math.round(params.trend_ema ?? 100)),
  };
}

/**
 * Evaluates one strategy against a closed-candle series.
 * Returns a directional signal or null when the filters reject the setup.
 */
export function evaluateStrategy(
  strategyKey: string,
  candles: Candle[],
  params: Params,
): SignalResult {
  if (candles.length < 60) {
    return { side: null, reason: "Warming up \u2014 not enough closed bars yet", atr: 0, price: 0 };
  }
  const ctx = baseContext(candles, params);
  const { i, closes, price, atrValue } = ctx;
  const none = (reason: string): SignalResult => ({ side: null, reason, atr: atrValue, price });
  const fire = (side: Side, reason: string): SignalResult => ({ side, reason, atr: atrValue, price });

  const trendValue = at(ctx.trend, i);
  const trendUp = trendValue != null && price > trendValue;
  const trendDown = trendValue != null && price < trendValue;

  switch (strategyKey) {
    case "ma_crossover": {
      const fast = ema(closes, Math.round(params.fast_ema));
      const slow = ema(closes, Math.round(params.slow_ema));
      const f = at(fast, i);
      const s = at(slow, i);
      const pf = at(fast, i - 1);
      const ps = at(slow, i - 1);
      if (f == null || s == null || pf == null || ps == null) return none("Moving averages still warming up");
      if (pf <= ps && f > s && trendUp) return fire("buy", "Fast EMA crossed above slow EMA with trend up");
      if (pf >= ps && f < s && trendDown) return fire("sell", "Fast EMA crossed below slow EMA with trend down");
      return none("No crossover on the last closed bar");
    }

    case "rsi_reversal": {
      const r = rsi(closes, Math.round(params.rsi_period));
      const now = at(r, i);
      const prev = at(r, i - 1);
      if (now == null || prev == null) return none("RSI still warming up");
      if (prev < params.rsi_oversold && now >= params.rsi_oversold)
        return fire("buy", `RSI reclaimed ${params.rsi_oversold} from oversold`);
      if (prev > params.rsi_overbought && now <= params.rsi_overbought)
        return fire("sell", `RSI lost ${params.rsi_overbought} from overbought`);
      return none(`RSI ${now.toFixed(1)} \u2014 no reversal trigger`);
    }

    case "breakout": {
      const ch = donchian(candles.slice(0, -1), Math.round(params.channel_period));
      const upper = at(ch.upper, ch.upper.length - 1);
      const lower = at(ch.lower, ch.lower.length - 1);
      if (upper == null || lower == null) return none("Channel still forming");
      if (price > upper) return fire("buy", `Closed above ${params.channel_period}-bar high`);
      if (price < lower) return fire("sell", `Closed below ${params.channel_period}-bar low`);
      return none("Price still inside the channel");
    }

    case "trend_follow": {
      const fast = ema(closes, Math.round(params.fast_ema));
      const slow = ema(closes, Math.round(params.slow_ema));
      const f = at(fast, i);
      const s = at(slow, i);
      if (f == null || s == null || trendValue == null) return none("Trend stack still warming up");
      const strength = atrValue === 0 ? 0 : Math.abs(price - trendValue) / atrValue;
      if (strength < params.min_trend_strength)
        return none(`Trend strength ${strength.toFixed(2)} below ${params.min_trend_strength}`);
      if (price > f && f > s && trendUp) return fire("buy", "Price, fast and slow EMA stacked bullish");
      if (price < f && f < s && trendDown) return fire("sell", "Price, fast and slow EMA stacked bearish");
      return none("EMA stack not aligned");
    }

    case "inanomax":
    case "dijja8": {
      const fast = ema(closes, Math.round(params.fast_ema));
      const slow = ema(closes, Math.round(params.slow_ema));
      const f = at(fast, i);
      const s = at(slow, i);
      if (f == null || s == null || trendValue == null || atrValue === 0)
        return none("Model inputs still warming up");
      const strength = Math.abs(price - trendValue) / atrValue;
      if (strength < params.min_trend_strength)
        return none(`Trend strength ${strength.toFixed(2)} below ${params.min_trend_strength}`);
      const distance = Math.abs(price - f) / atrValue;
      if (distance > params.atr_distance)
        return none(`Price ${distance.toFixed(2)} ATR from the MA \u2014 waiting for a closer pullback`);
      const pullbackLong = trendUp && f > s && candles[i].close > candles[i].open && candles[i - 1].close < candles[i - 1].open;
      const pullbackShort = trendDown && f < s && candles[i].close < candles[i].open && candles[i - 1].close > candles[i - 1].open;
      if (pullbackLong) return fire("buy", "Pullback into the fast MA inside an uptrend");
      if (pullbackShort) return fire("sell", "Pullback into the fast MA inside a downtrend");
      return none("Trend confirmed, waiting for the pullback trigger");
    }

    case "lumina_ai": {
      const bands = bollinger(closes, Math.round(params.bb_period), params.bb_mult);
      const r = rsi(closes, Math.round(params.rsi_period));
      const upper = at(bands.upper, i);
      const lower = at(bands.lower, i);
      const rv = at(r, i);
      if (upper == null || lower == null || rv == null) return none("Bands still warming up");
      if (price <= lower && rv < 40) return fire("buy", "Price at lower band with weak RSI \u2014 fading the move");
      if (price >= upper && rv > 60) return fire("sell", "Price at upper band with hot RSI \u2014 fading the move");
      return none("Price inside the bands");
    }

    case "dijja_range": {
      const strength = adx(candles, 14);
      const adxValue = at(strength.adx, i);
      if (adxValue == null) return none("ADX still warming up");
      if (adxValue > params.adx_max)
        return none(`ADX ${adxValue.toFixed(1)} above ${params.adx_max} \u2014 market is trending, standing aside`);
      const bands = bollinger(closes, Math.round(params.channel_period), params.bb_mult);
      const upper = at(bands.upper, i);
      const lower = at(bands.lower, i);
      if (upper == null || lower == null) return none("Range edges still forming");
      if (price <= lower) return fire("buy", "Buying the lower edge of a confirmed range");
      if (price >= upper) return fire("sell", "Selling the upper edge of a confirmed range");
      return none("Price mid-range \u2014 no edge");
    }

    default:
      return none("Unknown strategy");
  }
}
