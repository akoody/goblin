import {db} from '../config/db.js';
import {nativeAmount,nativeFail} from './native-chain-policy.js';
import {ethRpc,btcApi,assertMainnet,sourceChain,nativeConfigured} from './native-chain-client.js';
import {recordPendingDeposit,autoApproveBitcoinWithoutAml} from './deposit-compliance.service.js';
import {runNativeJobs,runNativeThresholds} from './native-chain.service.js';
let running=false;
let bitcoinPage=0,ethereumPage=0;
const historyStart=()=>{const timestamp=Date.parse(process.env.NATIVE_START_AT||'9999-12-31');if(!Number.isFinite(timestamp))nativeFail('Неверная дата начала процессинга','NATIVE_START_INVALID');return timestamp;};
function nextWallets(wallets,offset){if(!wallets.length)return [];return [...wallets.slice(offset),...wallets.slice(0,offset)].slice(0,10);}
async function knownTransaction(hash){const [[job]]=await db.execute('SELECT id FROM native_chain_jobs WHERE tx_hash=? LIMIT 1',[hash]);return Boolean(job);}
async function scanBitcoin(wallets){
 await assertMainnet('BTC');
 for(const wallet of wallets)try{
  const chain=await sourceChain('BTC',wallet.address);
  const handled=new Set();
  for(const output of chain.utxos){
   if(handled.has(output.txid))continue;handled.add(output.txid);
   const group=chain.utxos.filter(u=>u.txid===output.txid),eventIndex=Math.min(...group.map(u=>u.vout));
   if(await knownTransaction(output.txid))continue;
   const [[exists]]=await db.execute("SELECT id FROM blockchain_deposits WHERE network='BITCOIN' AND tx_hash=? AND event_index=?",[output.txid,eventIndex]);if(exists)continue;
   const tx=await btcApi(`/tx/${output.txid}`);
   if(Number(tx.status.block_time)*1000<historyStart())continue;
   const from=[...new Set((tx.vin||[]).map(v=>v.prevout?.scriptpubkey_address).filter(Boolean))];
   if(from.includes(wallet.address))continue;
   // A multi-input Bitcoin transaction has no single sender. It stays on manual AML review.
   await recordPendingDeposit({wallet,currency:'BTC',network:'BITCOIN',txHash:output.txid,eventIndex,from:from.length===1?from[0]:null,to:wallet.address,amount:nativeAmount(group.reduce((sum,u)=>sum+BigInt(u.value),0n),'BTC'),timestamp:Number(tx.status.block_time)*1000});
  }
 }catch{/* Never advance a deposit based on partial or unconfirmed UTXO data. */}
}
async function scanEthereum(wallets){
 await assertMainnet('ETH');
 const final=await ethRpc('eth_getBlockByNumber',['finalized',false]);
 const [[cursor]]=await db.execute("SELECT * FROM native_chain_cursor WHERE currency='ETH'");
 if(!cursor){
  await db.execute("INSERT IGNORE INTO native_chain_cursor(currency,block_height,block_hash) VALUES('ETH',?,?)",[Number(BigInt(final.number)),final.hash]);return;
 }
 const anchor=await ethRpc('eth_getBlockByNumber',['0x'+BigInt(cursor.block_height).toString(16),false]);
 if(anchor.hash!==cursor.block_hash)nativeFail('Изменилась подтверждённая история Ethereum','CHAIN_REORG');
 const byAddress=new Map(wallets.map(w=>[w.address.toLowerCase(),w]));
 const last=Math.min(Number(BigInt(final.number)),Number(cursor.block_height)+10);
 for(let height=Number(cursor.block_height)+1;height<=last;height++){
  const block=await ethRpc('eth_getBlockByNumber',['0x'+height.toString(16),true]);
  if(!block||!Array.isArray(block.transactions))nativeFail('Блок Ethereum недоступен','RPC_UNAVAILABLE');
  if(Number(BigInt(block.timestamp))*1000<historyStart()){
   await db.execute("UPDATE native_chain_cursor SET block_height=?,block_hash=? WHERE currency='ETH' AND block_height=?",[height,block.hash,height-1]);continue;
  }
  for(const tx of block.transactions){
   const wallet=tx.to&&byAddress.get(tx.to.toLowerCase());if(!wallet||BigInt(tx.value)<=0n||tx.from.toLowerCase()===tx.to.toLowerCase()||await knownTransaction(tx.hash))continue;
   const receipt=await ethRpc('eth_getTransactionReceipt',[tx.hash]);
   if(!receipt||receipt.blockHash!==block.hash)nativeFail('Не удалось сверить депозит с блоком','CHAIN_REORG');
   if(receipt.status!=='0x1')continue;
   await recordPendingDeposit({wallet,currency:'ETH',network:'ETHEREUM',txHash:tx.hash,eventIndex:0,from:tx.from,to:wallet.address,amount:nativeAmount(BigInt(tx.value),'ETH'),timestamp:Number(BigInt(block.timestamp))*1000});
  }
  await db.execute("UPDATE native_chain_cursor SET block_height=?,block_hash=? WHERE currency='ETH' AND block_height=?",[height,block.hash,height-1]);
 }
}
async function scanEthereumHistory(wallets){
 const final=await ethRpc('eth_getBlockByNumber',['finalized',false]);
 for(const wallet of wallets)try{
  // The indexer discovers contract-funded ETH; RPC finality and exact funding
  // reconciliation independently gate credit. Indexer data alone never credits funds.
  if(BigInt(await ethRpc('eth_getBalance',[wallet.address,'finalized']))===0n)continue;
  for(const kind of ['transactions','internal-transactions']){
   const handled=new Set();
   let page={};
   for(let count=0;count<10;count++){
    const query=new URLSearchParams(page);
    const r=await fetch(`https://eth.blockscout.com/api/v2/addresses/${wallet.address}/${kind}?${query}`,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!r.ok)nativeFail('Индексатор Ethereum недоступен','INDEXER_UNAVAILABLE');
    const data=await r.json();if(!Array.isArray(data.items))nativeFail('Неверный ответ индексатора','INDEXER_UNAVAILABLE');
    let reachedStart=false;
    for(const item of data.items){
     const internal=kind==='internal-transactions',hash=internal?item.transaction_hash:item.hash;
     if(new Date(item.timestamp).getTime()<historyStart()){reachedStart=true;continue;}
     if(item.to?.hash?.toLowerCase()!==wallet.address.toLowerCase()||BigInt(item.value||0)<=0n||item.error||internal&&!item.success)continue;
     if(await knownTransaction(hash))continue;
     if(handled.has(hash))continue;handled.add(hash);
     const index=internal?1:0;
     const [[known]]=await db.execute("SELECT id FROM blockchain_deposits WHERE network='ETHEREUM' AND tx_hash=? AND event_index=?",[hash,index]);if(known)continue;
     const receipt=await ethRpc('eth_getTransactionReceipt',[hash]);if(!receipt||BigInt(receipt.blockNumber)>BigInt(final.number)||receipt.status!=='0x1')continue;
     const block=await ethRpc('eth_getBlockByNumber',[receipt.blockNumber,false]);if(block.hash!==receipt.blockHash)nativeFail('История Ethereum изменилась','CHAIN_REORG');
     if(Number(BigInt(block.timestamp))*1000<historyStart())continue;
     const tx=await ethRpc('eth_getTransactionByHash',[hash]);
     if(internal&&tx.from.toLowerCase()===item.from?.hash?.toLowerCase()&&tx.to?.toLowerCase()===wallet.address.toLowerCase()&&BigInt(tx.value)===BigInt(item.value))continue;
     if(!internal&&(tx.to?.toLowerCase()!==wallet.address.toLowerCase()||BigInt(tx.value)!==BigInt(item.value)||tx.from.toLowerCase()!==item.from.hash.toLowerCase()))nativeFail('Индексатор не совпадает с RPC','INDEXER_MISMATCH');
     let value=BigInt(item.value),from=item.from?.hash||null;
     if(internal){
      let cursor={},complete=false;value=0n;const senders=new Set(),seen=new Set();
      for(let n=0;n<10;n++){
       const response=await fetch(`https://eth.blockscout.com/api/v2/transactions/${hash}/internal-transactions?${new URLSearchParams(cursor)}`,{signal:AbortSignal.timeout(12000),redirect:'error'});
       if(!response.ok)nativeFail('Не получена полная трасса депозита','INDEXER_UNAVAILABLE');
       const traces=await response.json();if(!Array.isArray(traces.items))nativeFail('Неполная трасса','INDEXER_UNAVAILABLE');
       for(const t of traces.items){if(!['call','selfdestruct'].includes(t.type)||!t.success||t.error||t.to?.hash?.toLowerCase()!==wallet.address.toLowerCase()||seen.has(t.index)||BigInt(t.value||0)<=0n)continue;seen.add(t.index);value+=BigInt(t.value);if(t.from?.hash)senders.add(t.from.hash);}
       if(!traces.next_page_params){complete=true;break;}cursor=traces.next_page_params;
      }
      if(!complete||value<=0n)nativeFail('Полная трасса требует ручной проверки','INDEXER_UNAVAILABLE');from=senders.size===1?[...senders][0]:null;
     }
     await recordPendingDeposit({wallet,currency:'ETH',network:'ETHEREUM',txHash:hash,eventIndex:index,from,to:wallet.address,amount:nativeAmount(value,'ETH'),timestamp:Number(BigInt(block.timestamp))*1000});
    }
    if(reachedStart||!data.next_page_params)break;page=data.next_page_params;
   }
  }
 }catch{/* Missing contract history quarantines the funding, never credits a guessed amount. */}
}
export async function runNativeChainCycle(){
 if(!nativeConfigured()||running)return;running=true;let c,held=false;
 try{
  c=await db.getConnection();const [[lock]]=await c.query("SELECT GET_LOCK('goblin-native-scanner',0) ok");held=Number(lock.ok)===1;if(!held)return;
  await runNativeJobs();
  const [wallets]=await db.query("SELECT id,currency,address FROM wallets WHERE currency IN ('BTC','ETH') AND address IS NOT NULL AND address<>'' ORDER BY id");
  try{await scanEthereum(wallets.filter(w=>w.currency==='ETH'));}catch{console.error('ETH discovery deferred; no guessed deposits credited');}
  const btc=wallets.filter(w=>w.currency==='BTC'),eth=wallets.filter(w=>w.currency==='ETH');
  try{await scanBitcoin(nextWallets(btc,bitcoinPage));}catch{console.error('BTC discovery deferred; no guessed deposits credited');}bitcoinPage=btc.length?(bitcoinPage+10)%btc.length:0;
  try{await scanEthereumHistory(nextWallets(eth,ethereumPage));}catch{console.error('ETH history discovery deferred');}ethereumPage=eth.length?(ethereumPage+10)%eth.length:0;
  await creditUnscreenedBitcoinDeposits();
  await runNativeThresholds();
 }finally{try{if(held)await c.query("SELECT RELEASE_LOCK('goblin-native-scanner')");}finally{c?.release();running=false;}}
}
export async function creditUnscreenedBitcoinDeposits(){
 const [rows]=await db.query(`SELECT r.deposit_id FROM deposit_reviews r JOIN blockchain_deposits d ON d.id=r.deposit_id
 JOIN native_chain_policy p ON p.currency='BTC' WHERE d.currency='BTC' AND d.network='BITCOIN'
 AND r.status='PENDING_CHAIN' AND r.aml_exempt=1 AND p.aml_disabled=1 AND p.deposits_enabled=1
 AND (r.chain_retry_at IS NULL OR r.chain_retry_at<=NOW()) ORDER BY r.created_at LIMIT 10`);
 for(const row of rows)try{await autoApproveBitcoinWithoutAml(row.deposit_id);}catch(e){
  const code=e.code==='DEPOSIT_BELOW_MINIMUM'?'DEPOSIT_BELOW_MINIMUM':/^[A-Z_]+$/.test(e.code||'')?e.code:'CHAIN_RECONCILIATION_REQUIRED';
  await db.execute('UPDATE deposit_reviews SET chain_retry_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE),chain_error=? WHERE deposit_id=? AND status=\'PENDING_CHAIN\'',[code,row.deposit_id]);
 }
}
export function startNativeChainEngine(){
 const run=()=>runNativeChainCycle().catch(()=>console.error('BTC/ETH processing deferred; balances remain protected'));
 run();const timer=setInterval(run,30000);timer.unref?.();return timer;
}
