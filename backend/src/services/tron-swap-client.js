import Decimal from 'decimal.js';
import {createTronWeb,TRON_USDT_CONTRACT,getSolidTronReceipt,broadcastTronTransaction} from './tron.service.js';
export const ROUTER='TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq';
export const TRX_WRAPPED='TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR';
export const units=value=>new Decimal(String(value)).mul(1e6).toFixed(0);
export const native=value=>new Decimal(String(value)).div(1e6).toFixed(6);
export const tronSwapReady=()=>Boolean(process.env.TRONGRID_API_KEY)&&process.env.TRON_SWAP_SIGNING_ENABLED!=='false';
export function swapAmount(value){const n=new Decimal(String(value));if(!n.isFinite()||n.lte(0)||n.gt(1000000)||n.decimalPlaces()>6)throw new Error('Сумма должна быть положительной, до 6 знаков после запятой');return n.toFixed(6);}
export function minOutput(value,slippage){if(!Number.isInteger(slippage)||slippage<10||slippage>300)throw new Error('Проскальзывание от 0,1% до 3%');return new Decimal(value).mul(10000-slippage).div(10000).floor().toFixed(0);}
export function tronWalletCompatibility(rows){
 const trx=rows.find(w=>w.currency==='TRX'),usdt=rows.find(w=>w.currency==='USDT');
 if(!trx?.address||trx.address!==usdt?.address||!trx.private_key)throw Object.assign(new Error('Для свапа нужны TRX и USDT на одном адресе TRON. Обратитесь в поддержку для настройки кошелька.'),{status:409});
 return {trx,usdt,address:trx.address};
}
export async function routerQuote(address,currency,amount){
 const t=createTronWeb();t.setAddress(address);
 const router=await t.contract().at(ROUTER);
 const wrapped=t.address.fromHex(await router.WETH().call());
 if(wrapped!==TRX_WRAPPED)throw new Error('Router wrapped token mismatch');
 const path=currency==='TRX'?[TRX_WRAPPED,TRON_USDT_CONTRACT]:[TRON_USDT_CONTRACT,TRX_WRAPPED];
 const amounts=await router.getAmountsOut(units(amount),path).call();
 const values=Array.isArray(amounts[0])?amounts[0]:amounts.amounts||amounts;
 const output=String(values[1]);if(!/^\d+$/.test(output)||BigInt(output)<=0n)throw new Error('Недостаточно ликвидности');
 return output;
}
export async function allowance(address){const t=createTronWeb();t.setAddress(address);const token=await t.contract().at(TRON_USDT_CONTRACT);return String(await token.allowance(address,ROUTER).call());}
export async function prepareSwapStep(job,step,key){
 const t=createTronWeb(key);
 if(t.address.fromPrivateKey(key)!==job.address)throw new Error('Swap signer mismatch');
 const trxBalance=new Decimal(String(await t.trx.getBalance(job.address)));
 const required=new Decimal(units(job.reserve_trx)).minus(units(job.fee_charged)).plus(job.input_currency==='TRX'?units(job.input_amount):0);
 if(trxBalance.lt(required))throw new Error('Недостаточно TRX на адресе для суммы и сетевых расходов');
 let contract,selector,params,callValue=0;
 if(step==='reset'||step==='approve'){
  contract=TRON_USDT_CONTRACT;selector='approve(address,uint256)';params=[{type:'address',value:ROUTER},{type:'uint256',value:step==='reset'?'0':units(job.input_amount)}];
 }else{
  contract=ROUTER;const deadline=Math.floor(Date.now()/1000)+300;
  if(job.input_currency==='TRX'){
   selector='swapExactETHForTokens(uint256,address[],address,uint256)';callValue=Number(units(job.input_amount));
   params=[{type:'uint256',value:units(job.minimum_output)},{type:'address[]',value:[TRX_WRAPPED,TRON_USDT_CONTRACT]},{type:'address',value:job.address},{type:'uint256',value:deadline}];
  }else{
   selector='swapExactTokensForETH(uint256,uint256,address[],address,uint256)';
   params=[{type:'uint256',value:units(job.input_amount)},{type:'uint256',value:units(job.minimum_output)},{type:'address[]',value:[TRON_USDT_CONTRACT,TRX_WRAPPED]},{type:'address',value:job.address},{type:'uint256',value:deadline}];
  }
 }
 const built=await t.transactionBuilder.triggerSmartContract(contract,selector,{feeLimit:Number(job.fee_limit_sun),callValue},params,job.address);
 if(!built.result?.result||!built.transaction)throw new Error('Не удалось построить транзакцию свапа');
 const signed=await t.trx.sign(built.transaction,key);return signed;
}
const hexAddress=value=>String(value||'').replace(/^0x/,'').slice(-40).toLowerCase();
const uint=value=>{const s=String(value??'0');if(!/^\d+$/.test(s)||(typeof value==='number'&&!Number.isSafeInteger(value)))throw new Error('Unsafe receipt amount');return BigInt(s);};
export function swapReceiptOutput(receipt,job){
 const t=createTronWeb(),owner=hexAddress(t.address.toHex(job.address)),token=hexAddress(t.address.toHex(TRON_USDT_CONTRACT));
 const transferTopic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 let received=0n,sent=0n;
 for(const log of receipt.log||[]){
  if(hexAddress(log.address)!==token||log.topics?.[0]!==transferTopic||!log.topics[2]||!/^([0-9a-fA-F]{64})$/.test(log.data||''))continue;
  const amount=BigInt('0x'+log.data);
  if(hexAddress(log.topics[2])===owner)received+=amount;
  if(hexAddress(log.topics[1])===owner)sent+=amount;
 }
 if(job.input_currency==='TRX')return received;
 if(sent!==BigInt(units(job.input_amount)))throw new Error('USDT input receipt mismatch');
 let trx=0n;
 for(const transfer of receipt.internal_transactions||[]){
  if(transfer.rejected||hexAddress(transfer.transferTo_address)!==owner)continue;
  for(const value of transfer.callValueInfo||[])if(!value.tokenId||value.tokenId==='_')trx+=uint(value.callValue);
 }
 return trx;
}
export {getSolidTronReceipt,broadcastTronTransaction};
