import {Wallet,SigningKey,Signature,hexlify,concat,getAddress,keccak256,Transaction as EthTransaction} from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import {nativeFail,validateNativePlan} from './native-chain-policy.js';
const BTC_GENESIS='000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
export const nativeConfigured=()=>process.env.NATIVE_CHAINS_ENABLED==='true';
export async function ethRpc(method,params=[],fetchImpl=fetch){
 const r=await fetchImpl(process.env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!r.ok)nativeFail('Узел Ethereum недоступен','RPC_UNAVAILABLE',503);
 const body=await r.json();if(body.error||!Object.hasOwn(body,'result'))nativeFail('Узел Ethereum отклонил запрос','RPC_UNAVAILABLE',503);return body.result;
}
export async function btcApi(path,body,fetchImpl=fetch){
 const base=(process.env.BITCOIN_API_URL||'https://blockstream.info/api').replace(/\/$/,'');
 const r=await fetchImpl(base+path,{...(body?{method:'POST',headers:{'Content-Type':'text/plain'},body}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});
 if(r.status===404)return null;if(!r.ok)nativeFail('Узел Bitcoin недоступен','RPC_UNAVAILABLE',503);
 const text=await r.text();try{return JSON.parse(text);}catch{return text;}
}
export async function assertMainnet(currency){
 if(currency==='ETH'){if(await ethRpc('eth_chainId')!=='0x1')nativeFail('Неверная сеть Ethereum','WRONG_NETWORK');}
 else if(await btcApi('/block-height/0')!==BTC_GENESIS)nativeFail('Неверная сеть Bitcoin','WRONG_NETWORK');
}
export function nativeAddress(currency,address){
 if(currency==='ETH'){try{return getAddress(address);}catch{nativeFail('Некорректный адрес Ethereum','INVALID_ADDRESS',400);}}
 try{bitcoin.address.toOutputScript(address,bitcoin.networks.bitcoin);return address;}catch{nativeFail('Некорректный адрес Bitcoin mainnet','INVALID_ADDRESS',400);}
}
export function btcSigner(key){
 const signing=new SigningKey(key.startsWith('0x')?key:`0x${key}`);
 return {publicKey:Buffer.from(signing.compressedPublicKey.slice(2),'hex'),sign:hash=>{const s=signing.sign(hexlify(hash));return Buffer.from(concat([s.r,s.s]).slice(2),'hex');}};
}
export function nativeKeyAddress(currency,key){return currency==='ETH'?new Wallet(key).address:bitcoin.payments.p2wpkh({pubkey:btcSigner(key).publicKey,network:bitcoin.networks.bitcoin}).address;}
export async function sourceChain(currency,address){
 await assertMainnet(currency);
 if(currency==='ETH'){
  const [final,latest,pending,nonce,pendingNonce,code]=await Promise.all([ethRpc('eth_getBalance',[address,'finalized']),ethRpc('eth_getBalance',[address,'latest']),ethRpc('eth_getBalance',[address,'pending']),ethRpc('eth_getTransactionCount',[address,'latest']),ethRpc('eth_getTransactionCount',[address,'pending']),ethRpc('eth_getCode',[address,'latest'])]);
  if(final!==latest||latest!==pending||nonce!==pendingNonce||code!=='0x')nativeFail('Есть неподтверждённые операции или нестандартный кошелёк','SOURCE_BUSY');
  return {balance:BigInt(final).toString(),nonce:Number(BigInt(nonce))};
 }
 const [raw,height]=await Promise.all([btcApi(`/address/${address}/utxo`),btcApi('/blocks/tip/height')]);
 if(!Array.isArray(raw)||raw.length>100)nativeFail('Слишком много входов: требуется отдельный пакет','UTXO_LIMIT');
 const utxos=[];
 for(const u of raw){
  if(!u.status?.confirmed||Number(height)-u.status.block_height+1<6)nativeFail('Ожидается 6 подтверждений Bitcoin','SOURCE_BUSY');
  const hex=await btcApi(`/tx/${u.txid}/hex`),tx=bitcoin.Transaction.fromHex(hex),output=tx.outs[u.vout];
  if(tx.isCoinbase()&&Number(height)-u.status.block_height+1<100)nativeFail('Coinbase требует 100 подтверждений','SOURCE_BUSY');
  if(tx.getId()!==u.txid||!output||!Buffer.from(output.script).equals(Buffer.from(bitcoin.address.toOutputScript(address)))||output.value!==BigInt(u.value))nativeFail('UTXO не соответствует транзакции','UTXO_MISMATCH');
  if(await btcApi(`/block-height/${u.status.block_height}`)!==u.status.block_hash)nativeFail('Неподтверждённая ветка Bitcoin','CHAIN_REORG');
  utxos.push({txid:u.txid,vout:u.vout,value:String(u.value),script:Buffer.from(output.script).toString('hex')});
 }
 return {balance:utxos.reduce((s,u)=>s+BigInt(u.value),0n).toString(),utxos};
}
export async function nativeNetworkCost(currency,sources,outputs){
 if(currency==='ETH'){
  if(await ethRpc('eth_getCode',[outputs[0].address,'latest'])!=='0x')nativeFail('Вывод ETH пока поддерживает только обычные кошельки, не контракты','CONTRACT_RECIPIENT');
  const gasPrice=BigInt(await ethRpc('eth_gasPrice'));
  if(gasPrice<=0n)nativeFail('Некорректная стоимость газа','RPC_UNAVAILABLE');
  return {fee:(gasPrice*21000n).toString(),gasPrice:gasPrice.toString()};
 }
 const rates=await btcApi('/fee-estimates'),rate=Math.ceil(Number(rates?.['6']));
 if(!Number.isSafeInteger(rate)||rate<1||rate>1000)nativeFail('Оценка комиссии Bitcoin недоступна','RPC_UNAVAILABLE');
 // Conservative upper bound including each destination/change script and witness.
 const inputs=sources.reduce((s,x)=>s+x.chain.utxos.length,0);
 const vbytes=12+inputs*69+outputs.reduce((s,o)=>s+9+bitcoin.address.toOutputScript(o.address).length,0);
 return {fee:String(BigInt(vbytes)*BigInt(rate)),satVbyte:rate};
}
export function buildNativeTransaction(plan,keys){
 validateNativePlan(plan);
 if(plan.currency==='ETH'){
  const source=plan.sources[0],signer=new Wallet(keys[0]);
  if(signer.address.toLowerCase()!==source.address.toLowerCase())nativeFail('Ключ кошелька не совпадает с адресом','SIGNER_MISMATCH');
  return signer.signTransaction({chainId:1,type:0,nonce:source.chain.nonce,to:plan.outputs[0].address,value:BigInt(plan.outputs[0].value),gasLimit:21000n,gasPrice:BigInt(plan.cost.gasPrice)}).then(hex=>({hex,hash:keccak256(hex)}));
 }
 const psbt=new bitcoin.Psbt({network:bitcoin.networks.bitcoin});let index=0;const signers=[];
 for(let i=0;i<plan.sources.length;i++){
  const s=plan.sources[i],key=btcSigner(keys[i]);if(nativeKeyAddress('BTC',keys[i])!==s.address)nativeFail('Ключ Bitcoin не совпадает','SIGNER_MISMATCH');
  for(const u of s.chain.utxos){psbt.addInput({hash:u.txid,index:u.vout,sequence:0xffffffff,witnessUtxo:{script:Buffer.from(u.script,'hex'),value:BigInt(u.value)}});signers.push([index++,key]);}
 }
 for(const o of plan.outputs){if(BigInt(o.value)<546n)nativeFail('Выход Bitcoin ниже безопасного порога dust','DUST_OUTPUT');psbt.addOutput({address:o.address,value:BigInt(o.value)});}
 for(const [i,key] of signers)psbt.signInput(i,key);
 if(!psbt.validateSignaturesOfAllInputs((publicKey,hash,sig)=>{
  for(const yParity of [0,1])try{const s=Signature.from({r:hexlify(sig.slice(0,32)),s:hexlify(sig.slice(32)),yParity});if(SigningKey.computePublicKey(SigningKey.recoverPublicKey(hexlify(hash),s),true)===hexlify(publicKey))return true;}catch{}
  return false;
 }))nativeFail('Не удалось проверить подпись Bitcoin','SIGNATURE_INVALID');
 psbt.finalizeAllInputs();const tx=psbt.extractTransaction();
 const input=plan.sources.reduce((s,x)=>s+BigInt(x.chain.balance),0n),output=tx.outs.reduce((s,x)=>s+x.value,0n);
 if(input-output!==BigInt(plan.cost.fee)||input-output<BigInt(tx.virtualSize())*BigInt(plan.cost.satVbyte))nativeFail('Неверный расчёт комиссии Bitcoin','FEE_MISMATCH');
 return Promise.resolve({hex:tx.toHex(),hash:tx.getId()});
}
export async function broadcastNative(job){
 const hash=job.currency==='ETH'?await ethRpc('eth_sendRawTransaction',[job.signed_hex]):await btcApi('/tx',job.signed_hex);
 if(String(hash).toLowerCase()!==job.tx_hash.toLowerCase())nativeFail('Узел вернул другую транзакцию','BROADCAST_UNCERTAIN');
}
export async function nativeReceipt(job,plan){
 await assertMainnet(job.currency);
 if(job.currency==='ETH'){
  const r=await ethRpc('eth_getTransactionReceipt',[job.tx_hash]);if(!r)return null;
  const finalized=await ethRpc('eth_getBlockByNumber',['finalized',false]);if(BigInt(r.blockNumber)>BigInt(finalized.number))return null;
  const block=await ethRpc('eth_getBlockByNumber',[r.blockNumber,false]);if(block.hash!==r.blockHash)nativeFail('Ethereum: требуется повторная сверка','CHAIN_REORG');
  const signed=EthTransaction.from(job.signed_hex);
  if(r.transactionHash!==signed.hash||r.from.toLowerCase()!==signed.from.toLowerCase()||r.to?.toLowerCase()!==signed.to.toLowerCase())nativeFail('Подтверждение не соответствует переводу','RECEIPT_MISMATCH');
  const fee=BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice);if(fee>BigInt(plan.cost.fee))nativeFail('Комиссия выше согласованной','FEE_MISMATCH');
  return {success:r.status==='0x1',fee};
 }
 const tx=await btcApi(`/tx/${job.tx_hash}`);if(!tx?.status?.confirmed)return null;
 const height=await btcApi('/blocks/tip/height');if(Number(height)-tx.status.block_height+1<6)return null;
 if(await btcApi(`/block-height/${tx.status.block_height}`)!==tx.status.block_hash)nativeFail('Bitcoin: требуется повторная сверка','CHAIN_REORG');
 const raw=await btcApi(`/tx/${job.tx_hash}/hex`);if(raw!==job.signed_hex)nativeFail('Транзакция не соответствует подписи','RECEIPT_MISMATCH');
 if(BigInt(tx.fee)!==BigInt(plan.cost.fee))nativeFail('Неверная комиссия Bitcoin','FEE_MISMATCH');
 return {success:true,fee:BigInt(tx.fee)};
}
