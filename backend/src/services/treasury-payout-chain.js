import DecimalBase from 'decimal.js';
const Decimal=DecimalBase.clone({precision:80});
import {PublicKey} from '@solana/web3.js';
import {nativeAddress,sourceChain,nativeNetworkCost,buildNativeTransaction,broadcastNative,nativeReceipt,assertMainnet,btcApi,ethRpc} from './native-chain-client.js';
const atomic=(value,currency)=>BigInt(new Decimal(value).mul(new Decimal(10).pow(currency==='BTC'?8:18)).toFixed(0));
const nativeAmount=(value,currency)=>new Decimal(String(value)).div(new Decimal(10).pow(currency==='BTC'?8:18)).toFixed(currency==='BTC'?8:18);
import {collectionChainBalance,estimateCollectionFee,buildCollection,broadcastCollection,collectionReceipt} from './collection-network.js';
import {isTronAddress} from './tron.service.js';
import {payoutAssets} from './treasury-payout-policy.js';

export function payoutAddress(currency,address){
 if(currency==='USDT'){if(!isTronAddress(address))throw Object.assign(new Error('Некорректный адрес TRON'),{status:400});return address;}
 if(currency==='SOL'){try{return new PublicKey(address).toBase58();}catch{throw Object.assign(new Error('Некорректный адрес Solana'),{status:400});}}
 return nativeAddress(currency,address);
}
export async function vaultChain(currency,address,quick=false){
 if(quick&&['BTC','ETH'].includes(currency)){
  await assertMainnet(currency);
  if(currency==='ETH')return {balance:nativeAmount(BigInt(await ethRpc('eth_getBalance',[address,'finalized'])),currency)};
  const data=await btcApi(`/address/${address}`),stats=data?.chain_stats;
  if(!Number.isSafeInteger(stats?.funded_txo_sum)||!Number.isSafeInteger(stats?.spent_txo_sum))throw new Error('Invalid Bitcoin balance');
  return {balance:nativeAmount(BigInt(stats.funded_txo_sum)-BigInt(stats.spent_txo_sum),currency)};
 }
 if(['BTC','ETH'].includes(currency)){const chain=await sourceChain(currency,address);return {balance:nativeAmount(chain.balance,currency),chain};}
 const network=payoutAssets[currency].network,chain=await collectionChainBalance(network,address);
 const divisor=currency==='USDT'?1e6:1e9;
 return {balance:new Decimal(chain.asset.toString()).div(divisor).toFixed(),gas:chain.gas===null?null:new Decimal(chain.gas.toString()).div(1e6).toFixed()};
}
export async function payoutQuote(currency,source,destination,gross){
 if(['BTC','ETH'].includes(currency)){
  const chain=source.chain,amount=atomic(gross,currency);
  const inputs=[{address:source.address,chain,balance:'0',liability:'0',earned:chain.balance,gross:amount.toString()}];
  const cost=await nativeNetworkCost(currency,inputs,[{address:destination},{address:source.address}]);
  if(amount<=BigInt(cost.fee))throw Object.assign(new Error('Сумма меньше расходов сети'),{status:409});
  const outputs=[{address:destination,value:(amount-BigInt(cost.fee)).toString()}];
  const change=BigInt(chain.balance)-amount;if(currency==='BTC'&&change>0n)outputs.push({address:source.address,value:change.toString()});
  if(currency==='BTC'&&(amount-BigInt(cost.fee)<546n||change>0n&&change<546n))throw Object.assign(new Error('Сумма или сдача Bitcoin ниже dust-порога. Измените сумму вывода.'),{status:409});
  return {fee:nativeAmount(cost.fee,currency),received:nativeAmount(amount-BigInt(cost.fee),currency),native:{currency,kind:'collection',sources:inputs,outputs,cost,gross:amount.toString()}};
 }
 const job={network:payoutAssets[currency].network,source_address:source.address,destination_address:destination,amount:gross};
 const fee=await estimateCollectionFee(job);
 const received=currency==='SOL'?new Decimal(gross).minus(fee):new Decimal(gross);
 if(received.lte(0))throw Object.assign(new Error('Сумма меньше расходов сети'),{status:409});
 return {fee,received:received.toFixed(),collection:job};
}
export async function signPayout(plan,key){
 if(plan.native){const signed=await buildNativeTransaction(plan.native,[key]);return {hash:signed.hash,signed:signed.hex};}
 return buildCollection({...plan.collection,fee_budget:plan.fee},key);
}
export async function sendPayout(row,plan){
 if(plan.native)return broadcastNative({currency:row.currency,signed_hex:row.signed_transaction,tx_hash:row.tx_hash});
 return broadcastCollection({...plan.collection,fee_budget:row.fee_budget,signed_transaction:row.signed_transaction});
}
export async function payoutReceipt(row,plan){
 if(plan.native){const receipt=await nativeReceipt({currency:row.currency,signed_hex:row.signed_transaction,tx_hash:row.tx_hash},plan.native);return receipt?{success:receipt.success,fee:nativeAmount(receipt.fee,row.currency)}:{pending:true};}
 return collectionReceipt({...plan.collection,fee_budget:row.fee_budget,signed_transaction:row.signed_transaction,tx_hash:row.tx_hash,expiry_height:plan.expiryHeight,expiry_time:plan.expiryTime});
}
