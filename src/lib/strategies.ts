export type ParamKey = string;

export interface ParamSpec {
  key: ParamKey;
  label: string;
  min?: number;
  max?: number;
  step: number;
  default: number;
}

export interface StrategyDoc {
  tagline: string;
  bestFor: string;
  timeframe: string;
  howItTrades: string;
  howToRun: string[];
  whatToExpect: string;
}

export type StrategyGroup = "Built-in" | "RL Models";

export interface Strategy {
  key: string;
  label: string;
  group: StrategyGroup;
  defaultTimeframe: string;
  defaultSymbol: string;
  params: ParamSpec[];
  doc: StrategyDoc;
}

const RISK: ParamSpec = {
  key: "risk_pct",
  label: "Risk % per trade (loss if stop hit)",
  min: 0.1,
  max: 20,
  step: 0.1,
  default: 1.5,
};
const NOTIONAL: ParamSpec = {
  key: "notional_cap",
  label: "Notional cap (% equity)",
  min: 1,
  max: 500,
  step: 1,
  default: 30,
};
const TP: ParamSpec = { key: "tp_r", label: "Take-profit target (\u00d7 risk)", min: 0.5, max: 20, step: 0.1, default: 3 };
const HARD_STOP: ParamSpec = { key: "hard_stop_atr", label: "Hard stop (\u00d7ATR)", min: 0.2, max: 10, step: 0.1, default: 2 };
const TRAIL: ParamSpec = { key: "trail_atr", label: "Trailing stop (\u00d7ATR)", min: 0.2, max: 10, step: 0.1, default: 2.5 };
const BREAKEVEN: ParamSpec = { key: "breakeven_atr", label: "Break-even after (\u00d7ATR)", min: 0, max: 10, step: 0.1, default: 1 };
const FAST: ParamSpec = { key: "fast_ema", label: "Fast EMA", min: 2, max: 200, step: 1, default: 10 };
const SLOW: ParamSpec = { key: "slow_ema", label: "Slow EMA", min: 3, max: 400, step: 1, default: 30 };
const TREND: ParamSpec = { key: "trend_ema", label: "Trend filter EMA", min: 10, max: 500, step: 1, default: 100 };
const ATR_DIST: ParamSpec = {
  key: "atr_distance",
  label: "Max distance from MA to enter (ATR) \u2014 smaller = sharper",
  min: 0.1,
  max: 10,
  step: 0.1,
  default: 1,
};
const TREND_STRENGTH: ParamSpec = {
  key: "min_trend_strength",
  label: "Min trend strength (0.35 default; lower=more trades, higher=choppier filter)",
  min: 0,
  max: 3,
  step: 0.05,
  default: 0.35,
};

export const STRATEGIES: Strategy[] = [
  {
    key: "ma_crossover",
    label: "MA Crossover",
    group: "Built-in",
    defaultTimeframe: "15m",
    defaultSymbol: "BTCUSD",
    params: [RISK, ATR_DIST, TP, NOTIONAL, FAST, SLOW, TREND, HARD_STOP, TRAIL, BREAKEVEN],
    doc: {
      tagline: "Classic dual moving-average system \u2014 the reference strategy.",
      bestFor: "Trending crypto and gold.",
      timeframe: "15m to 1h.",
      howItTrades:
        "Goes long when the fast EMA crosses above the slow EMA and short on the opposite cross, with the trend EMA acting as a directional gate. Exits on the reverse cross, the hard stop, or the take-profit target.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'MA Crossover' in the Bots tab.",
        "Set Symbol and Timeframe (15m is a good start).",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Steady trade frequency. Performs poorly in tight ranges, strongly in clean trends.",
    },
  },
  {
    key: "rsi_reversal",
    label: "RSI Reversal",
    group: "Built-in",
    defaultTimeframe: "5m",
    defaultSymbol: "BTCUSD",
    params: [
      RISK,
      { key: "rsi_period", label: "RSI length", min: 2, max: 100, step: 1, default: 14 },
      TP,
      NOTIONAL,
      { key: "rsi_oversold", label: "Oversold level", min: 5, max: 45, step: 1, default: 30 },
      { key: "rsi_overbought", label: "Overbought level", min: 55, max: 95, step: 1, default: 70 },
      TREND,
      HARD_STOP,
      TRAIL,
      BREAKEVEN,
    ],
    doc: {
      tagline: "Counter-trend model \u2014 buys exhaustion, sells euphoria.",
      bestFor: "Ranging majors and mid-cap crypto.",
      timeframe: "5m to 15m.",
      howItTrades:
        "Waits for RSI to leave the oversold or overbought zone and enters in the direction of the snap-back, sized off ATR. Closes at the take-profit target or when RSI returns to the midline.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'RSI Reversal' in the Bots tab.",
        "Set Symbol and Timeframe 5m.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "High trade count with small individual targets. Avoid during strong one-way trends.",
    },
  },
  {
    key: "breakout",
    label: "Breakout",
    group: "Built-in",
    defaultTimeframe: "15m",
    defaultSymbol: "BTCUSD",
    params: [
      RISK,
      { key: "channel_period", label: "Breakout lookback (bars)", min: 5, max: 200, step: 1, default: 20 },
      TP,
      NOTIONAL,
      { key: "atr_period", label: "ATR length", min: 2, max: 100, step: 1, default: 14 },
      TREND,
      HARD_STOP,
      TRAIL,
      BREAKEVEN,
    ],
    doc: {
      tagline: "Donchian channel breakout \u2014 trades expansion out of compression.",
      bestFor: "Gold and BTC during session opens.",
      timeframe: "15m and 1h.",
      howItTrades:
        "Marks the highest high and lowest low of the lookback window and enters when price closes outside the channel. Stops sit behind the channel edge and the trail follows ATR.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'Breakout' in the Bots tab.",
        "Set Symbol to XAUUSD or BTCUSD, Timeframe 15m.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Few signals, larger moves. Expect false breaks in quiet hours.",
    },
  },
  {
    key: "trend_follow",
    label: "Trend Follow",
    group: "Built-in",
    defaultTimeframe: "1h",
    defaultSymbol: "BTCUSD",
    params: [RISK, ATR_DIST, TP, NOTIONAL, FAST, SLOW, TREND, TREND_STRENGTH, HARD_STOP, TRAIL, BREAKEVEN],
    doc: {
      tagline: "Pure trend rider \u2014 stays in the move until structure breaks.",
      bestFor: "BTC, ETH and gold.",
      timeframe: "1h and 4h.",
      howItTrades:
        "Requires price, fast EMA and slow EMA all aligned above or below the trend filter, then holds with an ATR trailing stop until the trend flips.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'Trend Follow' in the Bots tab.",
        "Set Symbol and Timeframe 1h.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Long holding times and wide stops. Fewer, bigger outcomes.",
    },
  },
  {
    key: "inanomax",
    label: "INANOMAX \u2014 sniper scalper",
    group: "RL Models",
    defaultTimeframe: "5m",
    defaultSymbol: "BTCUSD",
    params: [
      RISK,
      { ...ATR_DIST, default: 0.5 },
      { ...TP, default: 2 },
      NOTIONAL,
      { ...FAST, default: 8 },
      { ...SLOW, default: 21 },
      { ...TREND, default: 50 },
      { ...TREND_STRENGTH, default: 0.5 },
      { ...HARD_STOP, default: 1.2 },
      { ...TRAIL, default: 1 },
      { ...BREAKEVEN, default: 0.5 },
    ],
    doc: {
      tagline: "Reinforcement-learned scalper \u2014 takes tight, high-conviction entries.",
      bestFor: "BTC and ETH.",
      timeframe: "5m works best (fast, frequent signals).",
      howItTrades:
        "Only fires when short-term momentum, trend alignment and volatility compression agree. Uses a tight hard stop and an aggressive break-even move, cutting losers fast.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'INANOMAX' in the Bots tab.",
        "Set Symbol to BTCUSD or ETHUSD, Timeframe 5m.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Many small trades. Tight stops mean a lower win rate is normal and acceptable.",
    },
  },
  {
    key: "lumina_ai",
    label: "Lumina AI \u2014 forex mean-reversion",
    group: "RL Models",
    defaultTimeframe: "15m",
    defaultSymbol: "EURUSD",
    params: [
      RISK,
      { key: "bb_period", label: "Band length", min: 5, max: 100, step: 1, default: 20 },
      { ...TP, default: 1.5 },
      NOTIONAL,
      { key: "bb_mult", label: "Band width (\u00d7 std dev)", min: 0.5, max: 5, step: 0.1, default: 2 },
      { key: "rsi_period", label: "RSI length", min: 2, max: 100, step: 1, default: 14 },
      { ...TREND, default: 200 },
      { ...HARD_STOP, default: 1.5 },
      { ...TRAIL, default: 2 },
      BREAKEVEN,
    ],
    doc: {
      tagline: "Mean-reversion model tuned for currency pairs.",
      bestFor: "EURUSD and other majors.",
      timeframe: "15m works best (stable ranges).",
      howItTrades:
        "Fades stretched moves back to the band midline when RSI confirms exhaustion and the higher-timeframe trend is flat. Targets the mean rather than a breakout.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'Lumina AI' in the Bots tab.",
        "Set Symbol to EURUSD, Timeframe 15m.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Consistent small wins with occasional larger losses when a range finally breaks.",
    },
  },
  {
    key: "dijja8",
    label: "Dijja8 \u2014 Smart Reversal (any TF)",
    group: "RL Models",
    defaultTimeframe: "1h",
    defaultSymbol: "XAUUSD",
    params: [RISK, ATR_DIST, TP, NOTIONAL, FAST, SLOW, TREND, TREND_STRENGTH, HARD_STOP, TRAIL, BREAKEVEN],
    doc: {
      tagline: "Trend-following swing model \u2014 rides bigger moves.",
      bestFor: "Gold and BTC.",
      timeframe: "1h works best (slower, larger moves).",
      howItTrades:
        "Enters pullbacks inside a confirmed trend and holds for the move, using a trailing stop and take-profit. Slower and wider than the scalpers.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'Dijja8' in the Bots tab.",
        "Set Symbol to XAUUSD or BTCUSD, Timeframe 1h.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Fewer, larger trades than INANOMAX. For patient, trend-riding rather than scalping.",
    },
  },
  {
    key: "dijja_range",
    label: "Dijja Range \u2014 Mean-Reversion (forex/ranging)",
    group: "RL Models",
    defaultTimeframe: "30m",
    defaultSymbol: "EURUSD",
    params: [
      RISK,
      { key: "channel_period", label: "Range lookback (bars)", min: 5, max: 200, step: 1, default: 20 },
      { ...TP, default: 1.5 },
      NOTIONAL,
      { key: "bb_mult", label: "Range edge tolerance (\u00d7 std dev)", min: 0.5, max: 5, step: 0.1, default: 2 },
      { key: "adx_max", label: "Max ADX to trade (higher = allows trends)", min: 5, max: 60, step: 1, default: 20 },
      { ...TREND, default: 200 },
      { ...HARD_STOP, default: 1.5 },
      { ...TRAIL, default: 2 },
      BREAKEVEN,
    ],
    doc: {
      tagline: "Range specialist \u2014 only trades when the market is going nowhere.",
      bestFor: "Forex majors in quiet sessions.",
      timeframe: "30m works best (clean ranges).",
      howItTrades:
        "Measures trend strength first and stands aside when ADX is high. Inside a confirmed range it sells the upper edge and buys the lower edge, targeting the midpoint.",
      howToRun: [
        "Connect your MT5 account.",
        "Pick 'Dijja Range' in the Bots tab.",
        "Set Symbol to EURUSD, Timeframe 30m.",
        "Leave defaults and tap Start.",
      ],
      whatToExpect: "Long idle periods, then clusters of trades. It deliberately skips trending conditions.",
    },
  },
];

export const STRATEGY_GROUPS: StrategyGroup[] = ["Built-in", "RL Models"];

export function getStrategy(key: string): Strategy {
  return STRATEGIES.find((s) => s.key === key) ?? STRATEGIES[0];
}

export function defaultParams(strategy: Strategy): Record<string, number> {
  return Object.fromEntries(strategy.params.map((p) => [p.key, p.default]));
}
