import DecimalBase from 'decimal.js';
const Decimal=DecimalBase.clone({precision:80});

export const payoutAssets=Object.freeze({USDT:{network:'TRON',precision:6,feeCurrency:'TRX'},SOL:{network:'SOLANA',precision:9,feeCurrency:'SOL'},BTC:{network:'BTC',precision:8,feeCurrency:'BTC'},ETH:{network:'ETH',precision:18,feeCurrency:'ETH'}});
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function payoutAmount(value,currency,{zero=false}={}){
 const asset=payoutAssets[currency];if(!asset)fail('Валюта казны не поддерживается');
 let amount;try{amount=new Decimal(String(value).trim().replace(',','.'));}catch{fail('Некорректная сумма');}
 if(!amount.isFinite()||amount.lt(0)||!zero&&amount.eq(0)||amount.decimalPlaces()>asset.precision||amount.gt('1000000000'))fail('Проверьте сумму и точность валюты');
 return amount.toFixed(asset.precision);
}
export function payoutAvailability({collected,spent,reserved,chain,book}){
 const values=[collected,spent,reserved,chain,book].map(value=>new Decimal(String(value)));
 if(values.some(value=>!value.isFinite()||value.lt(0)))throw Object.assign(new Error('Требуется сверка казны'),{status:409});
 const [received,used,held,balance,ledger]=values;
 if(used.plus(held).gt(received))throw Object.assign(new Error('Резервы превышают собранную комиссию'),{status:409});
 return Decimal.max(0,Decimal.min(received.minus(used).minus(held),balance,ledger)).toFixed();
}
export function payoutPolicy(input={},currency){
 if(!['manual','threshold'].includes(input.mode))fail('Неизвестный режим вывода');
 const threshold=payoutAmount(input.threshold,currency),maximumAmount=payoutAmount(input.maximumAmount,currency);
 if(new Decimal(maximumAmount).lt(threshold))fail('Лимит одной выплаты должен быть не ниже порога');
 const maximumFee=payoutAmount(input.maximumFee,payoutAssets[currency].feeCurrency==='TRX'?'USDT':currency);
 const gasReserve=payoutAmount(input.gasReserve||'0',payoutAssets[currency].feeCurrency==='TRX'?'USDT':currency,{zero:true});
 if(typeof input.destination!=='string'||input.destination.length>128)fail('Некорректный адрес');
 if(input.mode==='threshold'&&!input.destination.trim())fail('Для автовывода нужен адрес');
 if(!Number.isInteger(input.cooldownSeconds)||input.cooldownSeconds<60||input.cooldownSeconds>86400)fail('Интервал должен быть от 60 до 86400 секунд');
 return {mode:input.mode,threshold,maximumAmount,maximumFee,gasReserve,destination:input.destination.trim(),cooldownSeconds:input.cooldownSeconds};
}
