import Decimal from 'decimal.js';
import { depositPrecisions } from './deposit-policy.js';
const cache=new Map();
export async function depositQuote(currency) {
  if(!(currency in depositPrecisions))throw Object.assign(new Error('Неподдерживаемая валюта'),{status:400});
  // Fee USD is accounted in the site's USDT quote convention. No actual swap.
  if(currency==='USDT')return {price:'1',source:'USDT nominal',at:new Date()};
  const old=cache.get(currency);if(old&&Date.now()-old.at.getTime()<30000)return old;
  for(const provider of ['Binance','Bybit']) {
    try{
      const url=provider==='Binance'?`https://api.binance.com/api/v3/ticker/price?symbol=${currency}USDT`:`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${currency}USDT`;
      const response=await fetch(url,{signal:AbortSignal.timeout(4000)});if(!response.ok)continue;
      const body=await response.json(),raw=provider==='Binance'?body.price:body.result?.list?.[0]?.lastPrice;
      const price=new Decimal(String(raw));if(!price.isFinite()||price.lte(0)||price.gt('1000000000'))continue;
      const quote={price:price.toFixed(18),source:provider,at:new Date()};cache.set(currency,quote);return quote;
    }catch { /* Never use a stale or invented rate for financial settlement. */ }
  }
  throw Object.assign(new Error('Свежий курс недоступен. Депозит остаётся на проверке; деньги не списаны.'),{status:503});
}
