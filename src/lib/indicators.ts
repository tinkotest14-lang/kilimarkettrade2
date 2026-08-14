import type { Candle } from "./market/feed";

export type Series = (number | null)[];

const closeOf = (c: Candle[]) => c.map((x) => x.close);

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - period + 1 + j] * (j + 1);
    out[i] = acc / denom;
  }
  return out;
}

export function hma(values: number[], period: number): Series {
  const half = wma(values, Math.max(1, Math.floor(period / 2)));
  const full = wma(values, period);
  const raw = values.map((_, i) =>
    half[i] != null && full[i] != null ? 2 * (half[i] as number) - (full[i] as number) : NaN,
  );
  const cleaned = raw.map((v) => (Number.isFinite(v) ? v : 0));
  const smoothed = wma(cleaned, Math.max(1, Math.round(Math.sqrt(period))));
  return smoothed.map((v, i) => (Number.isFinite(raw[i]) ? v : null));
}

export function dema(values: number[], period: number): Series {
  const e1 = ema(values, period);
  const filled = e1.map((v) => v ?? 0);
  const e2 = ema(filled, period);
  return e1.map((v, i) => (v == null || e2[i] == null ? null : 2 * v - (e2[i] as number)));
}

export function tema(values: number[], period: number): Series {
  const e1 = ema(values, period);
  const e2 = ema(e1.map((v) => v ?? 0), period);
  const e3 = ema(e2.map((v) => v ?? 0), period);
  return e1.map((v, i) =>
    v == null || e2[i] == null || e3[i] == null ? null : 3 * v - 3 * (e2[i] as number) + (e3[i] as number),
  );
}

export function vwma(candles: Candle[], period: number): Series {
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      pv += candles[j].close * candles[j].volume;
      v += candles[j].volume;
    }
    out[i] = v === 0 ? null : pv / v;
  }
  return out;
}

export function alma(values: number[], period: number, offset = 0.85, sigma = 6): Series {
  const out: Series = new Array(values.length).fill(null);
  const m = offset * (period - 1);
  const s = period / sigma;
  const weights = Array.from({ length: period }, (_, i) => Math.exp(-((i - m) ** 2) / (2 * s * s)));
  const norm = weights.reduce((a, b) => a + b, 0);
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - period + 1 + j] * weights[j];
    out[i] = acc / norm;
  }
  return out;
}

export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] == null || s[i] == null ? null : (f[i] as number) - (s[i] as number)));
  const sig = ema(line.map((v) => v ?? 0), signal).map((v, i) => (line[i] == null ? null : v));
  const hist = line.map((v, i) => (v == null || sig[i] == null ? null : v - (sig[i] as number)));
  return { line, signal: sig, histogram: hist };
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  });
}

export function atr(candles: Candle[], period = 14): Series {
  const tr = trueRange(candles);
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function adx(candles: Candle[], period = 14) {
  const len = candles.length;
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const tr = trueRange(candles);
  const smooth = (arr: number[]) => {
    const out: Series = new Array(len).fill(null);
    if (len < period) return out;
    let acc = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out[period - 1] = acc;
    for (let i = period; i < len; i++) {
      acc = acc - acc / period + arr[i];
      out[i] = acc;
    }
    return out;
  };
  const strP = smooth(plusDM);
  const strM = smooth(minusDM);
  const strTR = smooth(tr);
  const plusDI: Series = new Array(len).fill(null);
  const minusDI: Series = new Array(len).fill(null);
  const dx: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (strTR[i] == null || (strTR[i] as number) === 0) continue;
    const p = (100 * (strP[i] as number)) / (strTR[i] as number);
    const m = (100 * (strM[i] as number)) / (strTR[i] as number);
    plusDI[i] = p;
    minusDI[i] = m;
    dx[i] = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  }
  const adxLine: Series = new Array(len).fill(null);
  const start = period * 2 - 1;
  if (len > start) {
    let prev = dx.slice(period, start + 1).reduce((a, b) => a + b, 0) / period;
    adxLine[start] = prev;
    for (let i = start + 1; i < len; i++) {
      prev = (prev * (period - 1) + dx[i]) / period;
      adxLine[i] = prev;
    }
  }
  return { adx: adxLine, plusDI, minusDI };
}

export function stdev(values: number[], period: number): Series {
  const means = sma(values, period);
  return means.map((mean, i) => {
    if (mean == null) return null;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - mean) ** 2;
    return Math.sqrt(acc / period);
  });
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const sd = stdev(values, period);
  return {
    middle: mid,
    upper: mid.map((m, i) => (m == null || sd[i] == null ? null : m + mult * (sd[i] as number))),
    lower: mid.map((m, i) => (m == null || sd[i] == null ? null : m - mult * (sd[i] as number))),
  };
}

export function keltner(candles: Candle[], period = 20, mult = 2) {
  const mid = ema(closeOf(candles), period);
  const range = atr(candles, period);
  return {
    middle: mid,
    upper: mid.map((m, i) => (m == null || range[i] == null ? null : m + mult * (range[i] as number))),
    lower: mid.map((m, i) => (m == null || range[i] == null ? null : m - mult * (range[i] as number))),
  };
}

export function donchian(candles: Candle[], period = 20) {
  const upper: Series = new Array(candles.length).fill(null);
  const lower: Series = new Array(candles.length).fill(null);
  const middle: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper[i] = hi;
    lower[i] = lo;
    middle[i] = (hi + lo) / 2;
  }
  return { upper, lower, middle };
}

export function cci(candles: Candle[], period = 20): Series {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const mean = sma(tp, period);
  return mean.map((m, i) => {
    if (m == null) return null;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - m);
    const md = dev / period;
    return md === 0 ? 0 : (tp[i] - m) / (0.015 * md);
  });
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: Series; d: Series } {
  const k: Series = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const d = sma(k.map((v) => v ?? 0), dPeriod).map((v, i) => (k[i] == null ? null : v));
  return { k, d };
}

export function obv(candles: Candle[]): Series {
  let acc = 0;
  return candles.map((c, i) => {
    if (i === 0) return 0;
    if (c.close > candles[i - 1].close) acc += c.volume;
    else if (c.close < candles[i - 1].close) acc -= c.volume;
    return acc;
  });
}

export function mfi(candles: Candle[], period = 14): Series {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tp[j] * candles[j].volume;
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function cmf(candles: Candle[], period = 20): Series {
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let mfv = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j];
      const range = c.high - c.low;
      const m = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
      mfv += m * c.volume;
      vol += c.volume;
    }
    out[i] = vol === 0 ? 0 : mfv / vol;
  }
  return out;
}

export function vwap(candles: Candle[]): Series {
  let pv = 0;
  let vol = 0;
  let day = "";
  return candles.map((c) => {
    const d = new Date(c.time * 1000).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    vol += c.volume;
    return vol === 0 ? null : pv / vol;
  });
}

export function parabolicSar(candles: Candle[], step = 0.02, max = 0.2): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  let up = candles[1].close >= candles[0].close;
  let sar = up ? candles[0].low : candles[0].high;
  let ep = up ? candles[0].high : candles[0].low;
  let af = step;
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    const c = candles[i];
    if (up) {
      if (c.low < sar) {
        up = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(af + step, max);
      }
    } else if (c.high > sar) {
      up = true;
      sar = ep;
      ep = c.high;
      af = step;
    } else if (c.low < ep) {
      ep = c.low;
      af = Math.min(af + step, max);
    }
    out[i] = sar;
  }
  return out;
}

export function supertrend(candles: Candle[], period = 10, mult = 3) {
  const range = atr(candles, period);
  const line: Series = new Array(candles.length).fill(null);
  const dir: (1 | -1 | null)[] = new Array(candles.length).fill(null);
  let prevUpper = 0;
  let prevLower = 0;
  let trend: 1 | -1 = 1;
  for (let i = 0; i < candles.length; i++) {
    if (range[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let upper = hl2 + mult * (range[i] as number);
    let lower = hl2 - mult * (range[i] as number);
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    upper = upper < prevUpper || prevClose > prevUpper ? upper : prevUpper;
    lower = lower > prevLower || prevClose < prevLower ? lower : prevLower;
    if (candles[i].close > prevUpper) trend = 1;
    else if (candles[i].close < prevLower) trend = -1;
    line[i] = trend === 1 ? lower : upper;
    dir[i] = trend;
    prevUpper = upper;
    prevLower = lower;
  }
  return { line, direction: dir };
}

export function ichimoku(candles: Candle[], conv = 9, base = 26, spanB = 52) {
  const hl = (period: number): Series => {
    const out: Series = new Array(candles.length).fill(null);
    for (let i = period - 1; i < candles.length; i++) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        hi = Math.max(hi, candles[j].high);
        lo = Math.min(lo, candles[j].low);
      }
      out[i] = (hi + lo) / 2;
    }
    return out;
  };
  const tenkan = hl(conv);
  const kijun = hl(base);
  return {
    tenkan,
    kijun,
    senkouA: tenkan.map((t, i) => (t == null || kijun[i] == null ? null : (t + (kijun[i] as number)) / 2)),
    senkouB: hl(spanB),
    chikou: candles.map((_, i) => (i + base < candles.length ? candles[i + base].close : null)),
  };
}
