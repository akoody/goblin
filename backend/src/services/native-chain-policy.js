import Decimal from 'decimal.js';
export const nativeDecimals = Object.freeze({BTC:8, ETH:18});
export const nativeFail = (message, code='NATIVE_BLOCKED', status=409) => {throw Object.assign(new Error(message), {code,status});};
export function atomic(value, currency) {
 const n=new Decimal(String(value)), precision=nativeDecimals[currency];
 if(precision===undefined||!n.isFinite()||n.lt(0)||n.decimalPlaces()>precision)nativeFail('Некорректная точность суммы','INVALID_AMOUNT',400);
 return BigInt(n.mul(new Decimal(10).pow(precision)).toFixed(0));
}
export const nativeAmount=(value,currency)=>new Decimal(String(value)).div(new Decimal(10).pow(nativeDecimals[currency])).toFixed(nativeDecimals[currency]);
export function sameNativePolicy(a,b){
 return a.currency===b.currency&&a.collection_mode===b.collection_mode&&
  ['deposits_enabled','withdrawals_enabled','aml_disabled'].every(k=>Boolean(Number(a[k]))===Boolean(Number(b[k])))&&
  ['withdrawal_fee_usd','minimum_withdrawal_usd','collection_threshold','minimum_source','maximum_network_fee'].every(k=>new Decimal(a[k]).eq(b[k]));
}
export function sameNativeChain(a,b){
 if(BigInt(a.balance)!==BigInt(b.balance))return false;
 if(a.nonce!==undefined||b.nonce!==undefined)return Number(a.nonce)===Number(b.nonce);
 const outputs=c=>(c.utxos||[]).map(u=>`${u.txid}:${u.vout}:${u.value}:${u.script}`).sort();
 return JSON.stringify(outputs(a))===JSON.stringify(outputs(b));
}
export function nativePolicy(input,currency){
 if(!Object.hasOwn(nativeDecimals,currency))nativeFail('Неизвестная сеть','INVALID_NETWORK',400);
 if(typeof input.deposits_enabled!=='boolean'||typeof input.withdrawals_enabled!=='boolean'||!['manual','threshold'].includes(input.collection_mode))nativeFail('Проверьте режимы операций','INVALID_POLICY',400);
 if(input.aml_disabled!==undefined&&typeof input.aml_disabled!=='boolean'||currency!=='BTC'&&input.aml_disabled===true)nativeFail('Отключение AML разрешено только для Bitcoin','INVALID_POLICY',400);
 const result={deposits_enabled:input.deposits_enabled,withdrawals_enabled:input.withdrawals_enabled,collection_mode:input.collection_mode,aml_disabled:input.aml_disabled===true};
 for(const key of ['withdrawal_fee_usd','minimum_withdrawal_usd','collection_threshold','minimum_source','maximum_network_fee']){
  let n;try{n=new Decimal(String(input[key]));}catch{nativeFail('Проверьте сумму в настройках','INVALID_POLICY',400);}
  const usd=key.endsWith('_usd');
  if(!n.isFinite()||n.lt(key==='withdrawal_fee_usd'?0:'0.000000000000000001')||n.gt(usd?10000:1000000)||n.decimalPlaces()>(usd?2:nativeDecimals[currency]))nativeFail('Проверьте лимиты и точность','INVALID_POLICY',400);
  result[key]=n.toFixed(usd?2:nativeDecimals[currency]);
 }
 if(new Decimal(result.minimum_withdrawal_usd).lt(5))nativeFail('Минимум вывода — от 5 USDT','INVALID_POLICY',400);
 return result;
}
export function proveCustody(chain,liability,earned){
 if(chain<0n||liability<0n||earned<0n||chain!==liability+earned)nativeFail('Баланс сети не сходится с клиентскими обязательствами и комиссией','CUSTODY_MISMATCH');
}
export function withdrawalTotals(amount,fee,network,available){
 const total=amount+fee+network;
 if(amount<=0n||fee<0n||network<=0n||total>available)nativeFail('Недостаточно свободных средств с учётом обеих комиссий','INSUFFICIENT_BALANCE');
 return total;
}
export function validateNativePlan(plan){
 const {currency,sources,outputs}=plan;
 if(!['BTC','ETH'].includes(currency)||!['withdrawal','collection'].includes(plan.kind)||!sources?.length||!outputs?.length||new Set(sources.map(s=>s.address.toLowerCase())).size!==sources.length)nativeFail('Некорректный план','INVALID_PLAN');
 const fee=BigInt(plan.cost.fee);if(fee<=0n)nativeFail('Нулевая комиссия сети','INVALID_PLAN');
 for(const s of sources)proveCustody(BigInt(s.chain.balance),atomic(s.balance,currency),BigInt(s.earned));
 if(currency==='ETH'&&(sources.length!==1||outputs.length!==1||fee!==BigInt(plan.cost.gasPrice)*21000n||!Number.isSafeInteger(sources[0].chain.nonce)))nativeFail('Неверный план Ethereum','INVALID_PLAN');
 let expectedChanges;
 if(plan.kind==='collection'){
  const gross=sources.reduce((sum,s)=>{if(BigInt(s.gross)<=0n||BigInt(s.gross)>BigInt(s.earned))nativeFail('Затронут клиентский остаток','INVALID_PLAN');return sum+BigInt(s.gross);},0n);
  if(gross!==BigInt(plan.gross)||gross<=fee||BigInt(outputs[0].value)!==gross-fee)nativeFail('Не сходится сумма сбора','INVALID_PLAN');
  expectedChanges=sources.map(s=>({address:s.address,value:BigInt(s.chain.balance)-BigInt(s.gross)}));
 }else{
  if(sources.length!==1||BigInt(outputs[0].value)!==BigInt(plan.amount)||BigInt(plan.total)!==withdrawalTotals(BigInt(plan.amount),BigInt(plan.serviceFee),fee,atomic(sources[0].balance,currency)))nativeFail('Неверный резерв вывода','INVALID_PLAN');
  expectedChanges=[{address:sources[0].address,value:BigInt(sources[0].chain.balance)-BigInt(plan.amount)-fee}];
 }
 if(currency==='BTC'){
  const changes=expectedChanges.filter(c=>c.value>0n);
  if(outputs.length!==changes.length+1||changes.some((c,i)=>outputs[i+1].address!==c.address||BigInt(outputs[i+1].value)!==c.value))nativeFail('Не сохранён клиентский остаток','INVALID_PLAN');
 }
 return true;
}
