import test from 'node:test';
import assert from 'node:assert/strict';
import {getMarketSnapshot} from '../src/services/market-data.service.js';

const binance=(url,price='100')=>{
  if(url.pathname.endsWith('/ticker/24hr'))return {lastPrice:price,priceChangePercent:'1',highPrice:price,lowPrice:price,quoteVolume:'200'};
  if(url.pathname.endsWith('/klines'))return [[1,price,price,price,price,'5',2,'200']];
  return {bids:[[price,'2']],asks:[[price,'3']]};
};
const bybit=(url)=>{
  if(url.pathname.endsWith('/tickers'))return {retCode:0,result:{list:[{lastPrice:'2',price24hPcnt:'0.01',highPrice24h:'2',lowPrice24h:'2',turnover24h:'200'}]}};
  if(url.pathname.endsWith('/kline'))return {retCode:0,result:{list:[[1,'2','2','2','2','5','200']]}};
  return {retCode:0,result:{b:[['2','2']],a:[['2','3']]}};
};
test('Spot and futures use different endpoints, independent caches, and deduplicate parallel reads',async()=>{
  const original=global.fetch;const requests=[];
  global.fetch=async input=>{const url=new URL(input);requests.push(url);return Response.json(binance(url,url.hostname.startsWith('fapi')?'110':'100'));};
  try{
    const [spot,duplicate,futures]=await Promise.all([getMarketSnapshot('BTC-USDT'),getMarketSnapshot('BTC-USDT','SPOT'),getMarketSnapshot('BTC-USDT','FUTURES')]);
    assert.equal(spot.price,'100');assert.equal(duplicate,spot);assert.equal(futures.price,'110');assert.equal(futures.market,'FUTURES');
    assert.equal(requests.length,4);assert.equal(requests.filter(u=>u.hostname==='fapi.binance.com').length,2);
    assert.equal((await getMarketSnapshot('BTC-USDT')).price,'100');assert.equal(requests.length,4);
    await assert.rejects(()=>getMarketSnapshot('BAD-USDT'),{status:400});
    await assert.rejects(()=>getMarketSnapshot('BTC-USDT','bad'),{status:400});
  }finally{global.fetch=original;}
});
test('1000-token futures contracts normalize prices and keep external depth out of quotes',async()=>{
  const original=global.fetch;
  global.fetch=async input=>{const url=new URL(input);assert.equal(url.searchParams.get('symbol'),'1000BONKUSDT');return Response.json(binance(url,'2'));};
  try{
    const data=await getMarketSnapshot('BONK-USDT','FUTURES');
    assert.equal(data.price,'0.002');assert.equal(data.candles[0].close,'0.002');assert.equal(data.depth,undefined);assert.equal(data.volume24h,'200');
  }finally{global.fetch=original;}
});
test('Bybit fallback stays in the same market and does not fall back to spot for futures',async()=>{
  const original=global.fetch;
  global.fetch=async input=>{
    const url=new URL(input);if(url.hostname.endsWith('binance.com'))throw Error('Unavailable');
    assert.equal(url.searchParams.get('category'),'linear');assert.equal(url.searchParams.get('symbol'),'1000SHIBUSDT');
    return Response.json(bybit(url));
  };
  try{const data=await getMarketSnapshot('SHIB-USDT','FUTURES');assert.equal(data.source,'Bybit');assert.equal(data.price,'0.002');assert.equal(data.depth,undefined);}
  finally{global.fetch=original;}
});
test('Stale quotes are marked, expire after one minute, and cannot leak into another market',async()=>{
  const original={fetch:global.fetch,now:Date.now};let now=original.now();Date.now=()=>now;
  global.fetch=async input=>Response.json(binance(new URL(input)));
  try{
    await getMarketSnapshot('ETH-USDT');now+=5000;
    global.fetch=async()=>{throw Error('Unavailable');};
    assert.equal((await getMarketSnapshot('ETH-USDT')).stale,true);
    await assert.rejects(()=>getMarketSnapshot('ETH-USDT','FUTURES'),{status:503});
    now+=60000;await assert.rejects(()=>getMarketSnapshot('ETH-USDT'),{status:503});
  }finally{global.fetch=original.fetch;Date.now=original.now;}
});
