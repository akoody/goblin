const SYMBOLS = {
  "BTC-USDT": { binance: "BTCUSDT", bybit: "BTCUSDT" },
  "ETH-USDT": { binance: "ETHUSDT", bybit: "ETHUSDT" },
  ...Object.fromEntries(['SOL','DOGE','SHIB','PEPE','BONK','WIF','FLOKI'].map(base=>[`${base}-USDT`,{binance:`${base}USDT`,bybit:`${base}USDT`}])),
};
export const supportedSymbols=Object.freeze(Object.keys(SYMBOLS));

const cache = new Map();
const CACHE_TTL_MS = 4_000;

const withTimeout = async (url, timeout = 3500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

const fromBinance = async (symbol) => {
  const code = SYMBOLS[symbol].binance;
  const [ticker, klines, depth] = await Promise.all([
    withTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=${code}`),
    withTimeout(`https://api.binance.com/api/v3/klines?symbol=${code}&interval=1h&limit=48`),
    withTimeout(`https://api.binance.com/api/v3/depth?symbol=${code}&limit=50`),
  ]);

  return {
    symbol,
    price: ticker.lastPrice,
    change24h: ticker.priceChangePercent,
    high24h: ticker.highPrice,
    low24h: ticker.lowPrice,
    volume24h: ticker.quoteVolume,
    candles: klines.map((item) => ({
      time: Number(item[0]),
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
      volume: item[7],
    })),
    depth: {
      bids: (depth.bids || []).map(([price, quantity]) => ({ price, quantity })),
      asks: (depth.asks || []).map(([price, quantity]) => ({ price, quantity })),
    },
    source: "Binance",
    updatedAt: new Date().toISOString(),
  };
};

const fromBybit = async (symbol) => {
  const code = SYMBOLS[symbol].bybit;
  const [tickerData, candleData, orderbookData] = await Promise.all([
    withTimeout(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${code}`),
    withTimeout(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${code}&interval=60&limit=48`),
    withTimeout(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${code}&limit=50`),
  ]);
  const ticker = tickerData.result?.list?.[0];
  if (!ticker) throw new Error("Bybit ticker is unavailable");
  const orderbook = orderbookData.result;

  return {
    symbol,
    price: ticker.lastPrice,
    change24h: String(Number(ticker.price24hPcnt || 0) * 100),
    high24h: ticker.highPrice24h,
    low24h: ticker.lowPrice24h,
    volume24h: ticker.turnover24h,
    candles: (candleData.result?.list || []).reverse().map((item) => ({
      time: Number(item[0]),
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
      volume: item[6],
    })),
    depth: {
      bids: (orderbook?.b || []).map(([price, quantity]) => ({ price, quantity })),
      asks: (orderbook?.a || []).map(([price, quantity]) => ({ price, quantity })),
    },
    source: "Bybit",
    updatedAt: new Date().toISOString(),
  };
};

export const isSupportedSymbol = (symbol) => Boolean(SYMBOLS[symbol]);

export async function getMarketSnapshot(symbol) {
  if (!isSupportedSymbol(symbol)) throw new Error("Unsupported symbol");
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.value;

  let value;
  try {
    value = await fromBinance(symbol);
  } catch (primaryError) {
    try {
      value = await fromBybit(symbol);
    } catch (fallbackError) {
      if (cached) return { ...cached.value, stale: true };
      throw new Error("Market data is temporarily unavailable", { cause: fallbackError });
    }
  }

  cache.set(symbol, { timestamp: Date.now(), value });
  return value;
}
