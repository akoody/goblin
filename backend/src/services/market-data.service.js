import DecimalJs from 'decimal.js';
const Decimal=DecimalJs.clone({precision:40});
const SYMBOLS = {
  "BTC-USDT": { binance: "BTCUSDT", bybit: "BTCUSDT" },
  "ETH-USDT": { binance: "ETHUSDT", bybit: "ETHUSDT" },
  ...Object.fromEntries(['SOL','DOGE','SHIB','PEPE','BONK','WIF','FLOKI'].map(base=>[`${base}-USDT`,{binance:`${base}USDT`,bybit:`${base}USDT`}])),
};
export const supportedSymbols=Object.freeze(Object.keys(SYMBOLS));

const cache = new Map();
const inFlight = new Map();
const CACHE_TTL_MS = 4_000;
const MAX_STALE_MS = 60_000;
const bundledFutures = new Set(['SHIB-USDT','PEPE-USDT','BONK-USDT','FLOKI-USDT']);
const marketError=(message,status=503)=>Object.assign(new Error(message),{status});

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

const fromBinance = async (symbol, market) => {
  const code = `${market==='FUTURES'&&bundledFutures.has(symbol)?'1000':''}${SYMBOLS[symbol].binance}`;
  const base=market==='FUTURES'?'https://fapi.binance.com/fapi/v1':'https://api.binance.com/api/v3';
  const [ticker, klines] = await Promise.all([
    withTimeout(`${base}/ticker/24hr?symbol=${code}`),
    withTimeout(`${base}/klines?symbol=${code}&interval=1h&limit=48`),
  ]);

  return {
    symbol,
    market,
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
    source: "Binance",
    updatedAt: new Date().toISOString(),
  };
};

const fromBybit = async (symbol, market) => {
  const code = `${market==='FUTURES'&&bundledFutures.has(symbol)?'1000':''}${SYMBOLS[symbol].bybit}`;
  const category=market==='FUTURES'?'linear':'spot';
  const [tickerData, candleData] = await Promise.all([
    withTimeout(`https://api.bybit.com/v5/market/tickers?category=${category}&symbol=${code}`),
    withTimeout(`https://api.bybit.com/v5/market/kline?category=${category}&symbol=${code}&interval=60&limit=48`),
  ]);
  if([tickerData,candleData].some(data=>Number(data.retCode)!==0))throw new Error('Bybit market request rejected');
  const ticker = tickerData.result?.list?.[0];
  if (!ticker) throw new Error("Bybit ticker is unavailable");

  return {
    symbol,
    market,
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
    source: "Bybit",
    updatedAt: new Date().toISOString(),
  };
};

export const isSupportedSymbol = (symbol) => Boolean(SYMBOLS[symbol]);

function normalizeSnapshot(value, market, symbol) {
  const factor=market==='FUTURES'&&bundledFutures.has(symbol)?1000:1;
  const price=raw=>{
    const number=new Decimal(raw);
    if(!number.isFinite()||number.lte(0))throw new Error('Invalid market price');
    return number.div(factor).toFixed();
  };
  if(!Array.isArray(value.candles)||!value.candles.length)throw new Error('Empty candles');
  if(!new Decimal(value.change24h).isFinite())throw new Error('Invalid price change');
  return {...value,price:price(value.price),high24h:price(value.high24h),low24h:price(value.low24h),
    candles:value.candles.map(candle=>({...candle,open:price(candle.open),high:price(candle.high),low:price(candle.low),close:price(candle.close)}))};
}

export async function getMarketSnapshot(symbol, market='SPOT') {
  market=String(market).toUpperCase();
  if(!['SPOT','FUTURES'].includes(market))throw marketError('Unsupported market',400);
  if (!isSupportedSymbol(symbol)) throw marketError('Unsupported symbol',400);
  const key=`${market}:${symbol}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.value;
  if(inFlight.has(key))return inFlight.get(key);
  const request=loadSnapshot(symbol,market,key,cached);
  inFlight.set(key,request);
  try{return await request;}finally{inFlight.delete(key);}
}

async function loadSnapshot(symbol,market,key,cached) {
  let value;
  try {
    value = normalizeSnapshot(await fromBinance(symbol,market),market,symbol);
  } catch (primaryError) {
    try {
      value = normalizeSnapshot(await fromBybit(symbol,market),market,symbol);
    } catch (fallbackError) {
      if (cached&&Date.now()-cached.timestamp<=MAX_STALE_MS) return { ...cached.value, stale: true };
      throw marketError('Market data is temporarily unavailable');
    }
  }

  cache.set(key, { timestamp: Date.now(), value });
  return value;
}
