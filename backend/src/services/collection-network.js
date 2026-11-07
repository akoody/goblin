import {PublicKey,Keypair,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import {connection,safeAtomic} from './solana-client.js';
import {createTronWeb,TRON_USDT_CONTRACT,broadcastTronTransaction,getSolidTronReceipt} from './tron.service.js';
import {collectionUnits,collectionNative,collectionSettlement} from './collection-math.js';
export async function collectionChainBalance(network,address){
 if(network==='SOLANA'){
  const rpc=connection();if(await rpc.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('Wrong Solana network');
  return {asset:safeAtomic(await rpc.getBalance(new PublicKey(address),'finalized')),gas:null};
 }
 if(process.env.TRON_FULL_HOST&&process.env.TRON_FULL_HOST.replace(/\/$/,'')!=='https://api.trongrid.io')throw new Error('Collection only supports pinned TRON mainnet');
 const t=createTronWeb();t.setAddress(address);const token=await t.contract().at(TRON_USDT_CONTRACT);
 return {asset:BigInt(String(await token.balanceOf(address).call())),gas:safeAtomic(await t.trx.getBalance(address))};
}
export async function estimateCollectionFee(job){
 if(job.network==='SOLANA'){
  const rpc=connection(),latest=await rpc.getLatestBlockhash('finalized');
  const message=new TransactionMessage({payerKey:new PublicKey(job.source_address),recentBlockhash:latest.blockhash,instructions:[SystemProgram.transfer({fromPubkey:new PublicKey(job.source_address),toPubkey:new PublicKey(job.destination_address),lamports:1n})]}).compileToV0Message();
  const fee=(await rpc.getFeeForMessage(message,'finalized')).value;
  return collectionNative(safeAtomic(fee),'SOLANA');
 }
 const t=createTronWeb();t.setAddress(job.source_address);
 const estimate=await t.transactionBuilder.estimateEnergy(TRON_USDT_CONTRACT,'transfer(address,uint256)',{},[{type:'address',value:job.destination_address},{type:'uint256',value:collectionUnits(job.amount,'TRON').toString()}],job.source_address);
 if(!estimate.result?.result||!estimate.energy_required)throw Object.assign(new Error('Оценка Energy недоступна'),{code:'ENERGY_ESTIMATE_UNAVAILABLE'});
 const params=await t.trx.getChainParameters(),price=params.find(p=>p.key==='getEnergyFee')?.value;
 if(!price||!Number.isSafeInteger(Number(price)))throw new Error('TRON energy price unavailable');
 return Decimal.max(3,new Decimal(estimate.energy_required).mul(price).mul('1.25').div(1e6).plus(2)).toDecimalPlaces(6,Decimal.ROUND_UP).toFixed(6);
}
export async function gasGrantReceipt(grant,treasuryAddress){
 const r=await getSolidTronReceipt(grant.tx_hash);if(!r?.id)return {pending:true,review:Date.now()>Number(grant.expiry_time)+600000};
 if(r.id!==grant.tx_hash)return {review:true};
 const t=createTronWeb(),tx=await t.trx.getTransaction(grant.tx_hash),contract=tx.raw_data?.contract?.[0];
 if(contract?.type!=='TransferContract'||tx.ret?.[0]?.contractRet!=='SUCCESS'||t.address.fromHex(contract.parameter.value.owner_address)!==treasuryAddress||t.address.fromHex(contract.parameter.value.to_address)!==grant.source_address||BigInt(String(contract.parameter.value.amount))!==collectionUnits(grant.amount,'TRON'))return {review:true};
 const fee=collectionNative(BigInt(String(r.fee||0)),'TRON');if(new Decimal(fee).gt(3))return {review:true};
 return {success:true,fee};
}
export async function buildCollection(job,key){
 if(job.network==='TRON'){
  if(createTronWeb().address.fromPrivateKey(key)!==job.source_address)throw new Error('Collection signer mismatch');
  const t=createTronWeb(key),budget=collectionUnits(job.fee_budget,'TRON'),bandwidth=2000000n;
  if(budget<=bandwidth)throw Object.assign(new Error('Лимит TRON слишком мал'),{code:'NETWORK_FEE_LIMIT'});
  const parameters=[{type:'address',value:job.destination_address},{type:'uint256',value:collectionUnits(job.amount,'TRON').toString()}];
  const built=await t.transactionBuilder.triggerSmartContract(TRON_USDT_CONTRACT,'transfer(address,uint256)',{feeLimit:Number(budget-bandwidth)},parameters,job.source_address);
  if(!built.result?.result||!built.transaction)throw new Error('Cannot build collection transfer');
  const signed=await t.trx.sign(built.transaction,key),params=await t.trx.getChainParameters(),price=params.find(p=>p.key==='getTransactionFee')?.value;
  const bytes=(signed.raw_data_hex?.length||0)/2+(signed.signature?.length||0)*65+128;
  if(!Number.isSafeInteger(Number(price))||Number(price)<=0||bytes>1024||BigInt(Math.ceil(bytes))*BigInt(price)>bandwidth)throw Object.assign(new Error('Bandwidth превышает резерв'),{code:'NETWORK_FEE_LIMIT'});
  return {hash:signed.txID,signed:JSON.stringify(signed),expiryTime:Number(signed.raw_data.expiration)};
 }
 const rpc=connection(),signer=Keypair.fromSecretKey(Buffer.from(key,'base64'));
 if(signer.publicKey.toBase58()!==job.source_address)throw new Error('Collection signer mismatch');
 const latest=await rpc.getLatestBlockhash('finalized');
 const make=lamports=>new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:latest.blockhash,instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(job.destination_address),lamports})]}).compileToV0Message();
 const fee=(await rpc.getFeeForMessage(make(1n),'finalized')).value;if(fee==null||!Number.isSafeInteger(fee))throw new Error('Solana fee unavailable');
 const amount=collectionUnits(job.amount,'SOLANA')-BigInt(fee);
 if(amount<=0n||BigInt(fee)>collectionUnits(job.fee_budget,'SOLANA'))throw Object.assign(new Error('Сетевые расходы превышают сумму или лимит'),{code:'NETWORK_FEE_LIMIT'});
 const tx=new VersionedTransaction(make(amount));tx.sign([signer]);
 const simulation=await rpc.simulateTransaction(tx,{sigVerify:true,commitment:'finalized'});
 if(simulation.value.err)throw Object.assign(new Error('Симуляция сбора отклонена'),{code:'SIMULATION_FAILED'});
 return {hash:bs58.encode(tx.signatures[0]),signed:Buffer.from(tx.serialize()).toString('base64'),expiryHeight:latest.lastValidBlockHeight};
}
export async function broadcastCollection(job){
 if(job.network==='TRON'){
  const signed=JSON.parse(job.signed_transaction),params=await createTronWeb().trx.getChainParameters(),price=params.find(p=>p.key==='getTransactionFee')?.value;
  const bytes=(signed.raw_data_hex?.length||0)/2+(signed.signature?.length||0)*65+128;
  if(!Number.isSafeInteger(Number(price))||Number(price)<=0||BigInt(Math.ceil(bytes))*BigInt(price)+BigInt(signed.raw_data.fee_limit)>collectionUnits(job.fee_budget,'TRON'))throw new Error('TRON fees changed beyond approved reserve');
  return broadcastTronTransaction(signed);
 }
 return connection().sendRawTransaction(Buffer.from(job.signed_transaction,'base64'),{skipPreflight:false,maxRetries:1});
}
export async function collectionReceipt(job){
 if(job.network==='TRON'){
  const r=await getSolidTronReceipt(job.tx_hash);if(!r?.id){return {pending:true,review:Date.now()>Number(job.expiry_time)+600000};}
  if(r.id!==job.tx_hash||!r.receipt?.result)return {review:true};
  const success=r.receipt.result==='SUCCESS';const fee=collectionNative(BigInt(String(r.fee||0)),'TRON');
  if(success){
   const t=createTronWeb(),hex=a=>String(a).replace(/^0x/,'').slice(-40).toLowerCase(),topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
   const amount=(r.log||[]).filter(l=>hex(l.address)===hex(t.address.toHex(TRON_USDT_CONTRACT))&&l.topics?.[0]===topic&&hex(l.topics[1])===hex(t.address.toHex(job.source_address))&&hex(l.topics[2])===hex(t.address.toHex(job.destination_address))).reduce((n,l)=>n+BigInt('0x'+l.data),0n);
   if(amount!==collectionUnits(job.amount,'TRON'))return {review:true};
  }
  return {success,fee};
 }
 const rpc=connection(),r=await rpc.getParsedTransaction(job.tx_hash,{commitment:'finalized',maxSupportedTransactionVersion:0});
 if(!r){
  const status=(await rpc.getSignatureStatuses([job.tx_hash],{searchTransactionHistory:true})).value[0];
  const message=VersionedTransaction.deserialize(Buffer.from(job.signed_transaction,'base64')).message;
  if(!status&&await rpc.getBlockHeight('finalized')>Number(job.expiry_height)+150&&!(await rpc.isBlockhashValid(message.recentBlockhash,{commitment:'finalized'})).value)return {expired:true};
  return {pending:true};
 }
 if(!r.meta)return {review:true};
 const source=r.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===job.source_address&&k.signer),dest=r.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===job.destination_address);
 if(source<0)return {review:true};
 const fee=collectionNative(safeAtomic(r.meta.fee),'SOLANA'),success=!r.meta.err;
 const s=collectionSettlement(job,success,fee);
 const cost=safeAtomic(r.meta.preBalances[source])-safeAtomic(r.meta.postBalances[source]);
 if(success&&(dest<0||safeAtomic(r.meta.postBalances[dest])-safeAtomic(r.meta.preBalances[dest])!==collectionUnits(s.received,'SOLANA')||cost!==collectionUnits(job.amount,'SOLANA')))return {review:true};
 if(!success&&cost!==safeAtomic(r.meta.fee))return {review:true};
 return {success,fee};
}
