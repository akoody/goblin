import Decimal from 'decimal.js';
export const depositPrecisions=Object.freeze({USDT:6,TRX:6,BTC:8,ETH:18,SOL:9});
export function bitcoinUnscreenedAllowed(deposit,policy){
 return deposit.currency==='BTC'&&deposit.network==='BITCOIN'&&deposit.status==='PENDING_CHAIN'&&Number(deposit.aml_exempt)===1&&policy?.currency==='BTC'&&Number(policy.aml_disabled)===1&&Number(policy.deposits_enabled)===1;
}
export function depositSettlement({amount,currency,feeUsd,quote,minUsd='5'}) {
  if(!(currency in depositPrecisions))throw new Error('Unsupported deposit currency');
  const gross=new Decimal(String(amount)),fee=new Decimal(String(feeUsd)),price=new Decimal(String(quote));
  if(!gross.isFinite()||!gross.gt(0)||gross.decimalPlaces()>depositPrecisions[currency]||!fee.isFinite()||fee.lt(0)||fee.gt(1000)||fee.decimalPlaces()>2||!price.isFinite()||!price.gt(0))throw new Error('Invalid deposit settlement');
  const minimum=new Decimal(String(minUsd));
  if(!minimum.isFinite()||minimum.lt(5)||gross.mul(price).lt(minimum))throw Object.assign(new Error('Депозит меньше минимального эквивалента 5 USDT. Средства удержаны для ручного разбора, комиссия не снята.'),{status:409,code:'DEPOSIT_BELOW_MINIMUM'});
  const cryptoFee=fee.div(price).toDecimalPlaces(depositPrecisions[currency],Decimal.ROUND_UP);
  if(gross.lte(cryptoFee))throw Object.assign(new Error('Сумма пополнения не превышает комиссию. Нужен ручной разбор; деньги не списаны.'),{status:409,code:'DEPOSIT_BELOW_FEE'});
  return {fee:cryptoFee.toFixed(depositPrecisions[currency]),net:gross.minus(cryptoFee).toFixed(depositPrecisions[currency]),gross:gross.toFixed(depositPrecisions[currency])};
}
export function validateManualReview(body) {
  if(!['APPROVE','BLOCK'].includes(body?.action))throw Object.assign(new Error('Выберите решение по депозиту'),{status:400});
  const bounded=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
  if(!bounded(body.note,10,2000))throw Object.assign(new Error('Укажите обоснование решения (10–2000 символов)'),{status:400});
  if(body.action==='APPROVE'&&(!bounded(body.provider,2,120)||!bounded(body.reference,8,1000)||!['LOW','MEDIUM'].includes(body.riskLevel)))throw Object.assign(new Error('Для зачисления нужен проверенный внешний AML-отчёт, его номер/ссылка, провайдер и допустимый уровень риска'),{status:400});
  return body;
}
