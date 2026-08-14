export type AssetClass = "Metals" | "Crypto" | "Forex" | "Commodities" | "Energy" | "Indices";

export interface SymbolSpec {
  /** Display symbol used everywhere in the UI. */
  symbol: string;
  /** Instrument name on the live feed. */
  feedSymbol: string;
  name: string;
  assetClass: AssetClass;
  /** Decimal places used for price formatting. */
  digits: number;
  /** Value of one price unit move for 1 lot, used for risk sizing. */
  contractSize: number;
}

export const SYMBOLS: SymbolSpec[] = [
  { symbol: "XAUUSD", feedSymbol: "PAXGUSDT", name: "Gold vs US Dollar", assetClass: "Metals", digits: 2, contractSize: 100 },
  { symbol: "BTCUSD", feedSymbol: "BTCUSDT", name: "Bitcoin vs US Dollar", assetClass: "Crypto", digits: 2, contractSize: 1 },
  { symbol: "ETHUSD", feedSymbol: "ETHUSDT", name: "Ethereum vs US Dollar", assetClass: "Crypto", digits: 2, contractSize: 1 },
  { symbol: "SOLUSD", feedSymbol: "SOLUSDT", name: "Solana vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "BNBUSD", feedSymbol: "BNBUSDT", name: "BNB vs US Dollar", assetClass: "Crypto", digits: 2, contractSize: 1 },
  { symbol: "XRPUSD", feedSymbol: "XRPUSDT", name: "XRP vs US Dollar", assetClass: "Crypto", digits: 4, contractSize: 1 },
  { symbol: "DOGEUSD", feedSymbol: "DOGEUSDT", name: "Dogecoin vs US Dollar", assetClass: "Crypto", digits: 5, contractSize: 1 },
  { symbol: "ADAUSD", feedSymbol: "ADAUSDT", name: "Cardano vs US Dollar", assetClass: "Crypto", digits: 4, contractSize: 1 },
  { symbol: "LINKUSD", feedSymbol: "LINKUSDT", name: "Chainlink vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "EURUSD", feedSymbol: "EURUSDT", name: "Euro vs US Dollar", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "GBPUSD", feedSymbol: "GBPUSDT", name: "British Pound vs US Dollar", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "USDJPY", feedSymbol: "JPYUSDT", name: "US Dollar vs Japanese Yen", assetClass: "Forex", digits: 2, contractSize: 100000 },
  { symbol: "AUDUSD", feedSymbol: "AUDUSDT", name: "Australian Dollar vs US Dollar", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "USDCAD", feedSymbol: "CADUSDT", name: "US Dollar vs Canadian Dollar", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "USDCHF", feedSymbol: "CHFUSDT", name: "US Dollar vs Swiss Franc", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "NZDUSD", feedSymbol: "NZDUSDT", name: "New Zealand Dollar vs US Dollar", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "EURGBP", feedSymbol: "EURGBP", name: "Euro vs British Pound", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "EURJPY", feedSymbol: "EURJPY", name: "Euro vs Japanese Yen", assetClass: "Forex", digits: 2, contractSize: 100000 },
  { symbol: "GBPJPY", feedSymbol: "GBPJPY", name: "British Pound vs Japanese Yen", assetClass: "Forex", digits: 2, contractSize: 100000 },
  { symbol: "USDMXN", feedSymbol: "USDMXN", name: "US Dollar vs Mexican Peso", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "USDZAR", feedSymbol: "USDZAR", name: "US Dollar vs South African Rand", assetClass: "Forex", digits: 4, contractSize: 100000 },
  { symbol: "XAGUSD", feedSymbol: "XAGUSDT", name: "Silver vs US Dollar", assetClass: "Metals", digits: 3, contractSize: 5000 },
  { symbol: "XPTUSD", feedSymbol: "XPTUSDT", name: "Platinum vs US Dollar", assetClass: "Metals", digits: 2, contractSize: 50 },
  { symbol: "XPDUSD", feedSymbol: "XPDUSDT", name: "Palladium vs US Dollar", assetClass: "Metals", digits: 2, contractSize: 100 },
  { symbol: "COPPERUSD", feedSymbol: "COPPERUSDT", name: "Copper vs US Dollar", assetClass: "Commodities", digits: 4, contractSize: 25000 },
  { symbol: "WHEATUSD", feedSymbol: "WHEATUSDT", name: "Wheat vs US Dollar", assetClass: "Commodities", digits: 2, contractSize: 5000 },
  { symbol: "CORNUSD", feedSymbol: "CORNUSDT", name: "Corn vs US Dollar", assetClass: "Commodities", digits: 2, contractSize: 5000 },
  { symbol: "SUGARUSD", feedSymbol: "SUGARUSDT", name: "Sugar vs US Dollar", assetClass: "Commodities", digits: 4, contractSize: 112000 },
  { symbol: "COCOAUSD", feedSymbol: "COCOAUSDT", name: "Cocoa vs US Dollar", assetClass: "Commodities", digits: 2, contractSize: 10 },
  { symbol: "COFFEEUSD", feedSymbol: "COFFEEUSDT", name: "Coffee vs US Dollar", assetClass: "Commodities", digits: 4, contractSize: 37500 },
  { symbol: "BRENTUSD", feedSymbol: "BRENTUSDT", name: "Brent Crude Oil", assetClass: "Energy", digits: 2, contractSize: 1000 },
  { symbol: "WTIUSD", feedSymbol: "WTIUSDT", name: "WTI Crude Oil", assetClass: "Energy", digits: 2, contractSize: 1000 },
  { symbol: "NATGASUSD", feedSymbol: "NATGASUSDT", name: "Natural Gas vs US Dollar", assetClass: "Energy", digits: 3, contractSize: 10000 },
  { symbol: "GASOLINEUSD", feedSymbol: "GASOLINEUSDT", name: "Gasoline vs US Dollar", assetClass: "Energy", digits: 4, contractSize: 42000 },
  { symbol: "LTCUSD", feedSymbol: "LTCUSDT", name: "Litecoin vs US Dollar", assetClass: "Crypto", digits: 2, contractSize: 1 },
  { symbol: "AVAXUSD", feedSymbol: "AVAXUSDT", name: "Avalanche vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "DOTUSD", feedSymbol: "DOTUSDT", name: "Polkadot vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "MATICUSD", feedSymbol: "MATICUSDT", name: "Polygon vs US Dollar", assetClass: "Crypto", digits: 4, contractSize: 1 },
  { symbol: "UNIUSD", feedSymbol: "UNIUSDT", name: "Uniswap vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "ATOMUSD", feedSymbol: "ATOMUSDT", name: "Cosmos vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "TRXUSD", feedSymbol: "TRXUSDT", name: "TRON vs US Dollar", assetClass: "Crypto", digits: 5, contractSize: 1 },
  { symbol: "SHIBUSD", feedSymbol: "SHIBUSDT", name: "Shiba Inu vs US Dollar", assetClass: "Crypto", digits: 8, contractSize: 1 },
  { symbol: "NEARUSD", feedSymbol: "NEARUSDT", name: "Near Protocol vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "APTUSD", feedSymbol: "APTUSDT", name: "Aptos vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "ARBUSDT", feedSymbol: "ARBUSDT", name: "Arbitrum vs US Dollar", assetClass: "Crypto", digits: 4, contractSize: 1 },
  { symbol: "OPUSD", feedSymbol: "OPUSDT", name: "Optimism vs US Dollar", assetClass: "Crypto", digits: 4, contractSize: 1 },
  { symbol: "FILUSD", feedSymbol: "FILUSDT", name: "Filecoin vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "AAVEUSD", feedSymbol: "AAVEUSDT", name: "Aave vs US Dollar", assetClass: "Crypto", digits: 3, contractSize: 1 },
  { symbol: "NAS100", feedSymbol: "NDX", name: "Nasdaq 100", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "US30", feedSymbol: "DJI", name: "Dow Jones 30", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "SPX500", feedSymbol: "SPX", name: "S&P 500", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "GER40", feedSymbol: "DAX", name: "Germany 40", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "UK100", feedSymbol: "UKX", name: "UK 100", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "JPN225", feedSymbol: "NI225", name: "Japan 225", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "FRA40", feedSymbol: "CAC40", name: "France 40", assetClass: "Indices", digits: 2, contractSize: 1 },
  { symbol: "AUS200", feedSymbol: "ASX200", name: "Australia 200", assetClass: "Indices", digits: 2, contractSize: 1 },
];

const BY_SYMBOL = new Map(SYMBOLS.map((s) => [s.symbol, s]));

export function getSymbolSpec(symbol: string): SymbolSpec {
  return BY_SYMBOL.get(symbol) ?? SYMBOLS[0];
}

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

export function formatPrice(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}