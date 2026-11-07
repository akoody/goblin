import Decimal from 'decimal.js';
export const collectionUnits=(amount,network)=>{
 const n=new Decimal(String(amount)),scale=network==='TRON'?6:9;
 if(!n.isFinite()||n.lt(0)||n.decimalPlaces()>scale)throw new Error('Invalid collection amount');
 return BigInt(n.mul(new Decimal(10).pow(scale)).toFixed(0));
};
export const collectionNative=(units,network)=>new Decimal(String(units)).div(network==='TRON'?1e6:1e9).toFixed(network==='TRON'?6:9);
export function reconcileOwnedFunds({chain,liability,earned}){
 const c=BigInt(chain),l=BigInt(liability),e=BigInt(earned);
 if(c<0n||l<0n||e<0n||c!==l+e)throw Object.assign(new Error('Баланс сети не совпадает с обязательствами перед клиентом и подтверждённой комиссией'),{code:'CUSTODY_MISMATCH'});
 return e;
}
export function collectionSettlement(job,success,actualFee){
 const fee=new Decimal(String(actualFee));if(!fee.isFinite()||fee.lt(0)||fee.gt(job.fee_budget))throw new Error('Collection fee exceeds reservation');
 const amount=new Decimal(job.amount),received=success?amount.minus(job.network==='SOLANA'?fee:0):new Decimal(0);
 if(received.lt(0))throw new Error('Collection produces negative proceeds');
 return {received:received.toFixed(job.network==='TRON'?6:9),fee:fee.toFixed(job.network==='TRON'?6:9)};
}
