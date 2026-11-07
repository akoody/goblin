import {randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import {Wallet} from 'ethers';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {depositQuote} from './deposit-quote.service.js';
import {encryptWalletPrivateKey,decryptWalletPrivateKey} from './wallet-generator.service.js';
import {atomic,nativeAmount,nativePolicy,nativeFail,proveCustody,withdrawalTotals,sameNativePolicy,sameNativeChain} from './native-chain-policy.js';
import {nativeConfigured,nativeAddress,nativeKeyAddress,sourceChain,nativeNetworkCost,buildNativeTransaction,broadcastNative,nativeReceipt} from './native-chain-client.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const active="('prepared','submitted','review')";
const fail=nativeFail;

async function exclusive(work){
 const c=await db.getConnection();let held=false;
 try{const [[row]]=await c.query("SELECT GET_LOCK('goblin-native-chains',0) AS ok");held=Number(row.ok)===1;if(!held)fail('Операция уже обрабатывается. Повторите после обновления.','BUSY');return await work();}
 finally{try{if(held)await c.query("SELECT RELEASE_LOCK('goblin-native-chains')");}finally{c.release();}}
}
export async function nativeOverview(){
 const [policies]=await db.query('SELECT p.*,v.address FROM native_chain_policy p LEFT JOIN treasury_collection_wallets v ON v.network=p.currency ORDER BY p.currency');
 const [jobs]=await db.query('SELECT id,currency,kind,user_id,status,tx_hash,network_fee,received,error_code,created_at FROM native_chain_jobs ORDER BY created_at DESC LIMIT 100');
 const [income]=await db.query("SELECT currency,kind,SUM(amount) amount,COUNT(*) count FROM native_fee_ledger GROUP BY currency,kind");
 return {configured:nativeConfigured(),policies:policies.map(p=>({...p,deposits_enabled:Boolean(p.deposits_enabled),withdrawals_enabled:Boolean(p.withdrawals_enabled),aml_disabled:Boolean(p.aml_disabled)})),jobs,income,bitcoinAml:policies.find(p=>p.currency==='BTC')?.aml_disabled?'DISABLED_BY_ADMIN':'MANUAL_EXTERNAL_REPORT_REQUIRED'};
}
export async function saveNativePolicy(actor,currency,body){
 const policy=nativePolicy(body,currency);
 await transact(async c=>{
  const [[old]]=await c.execute('SELECT currency FROM native_chain_policy WHERE currency=? FOR UPDATE',[currency]);if(!old)fail('Сеть не найдена');
  await c.execute('UPDATE native_chain_policy SET deposits_enabled=?,withdrawals_enabled=?,withdrawal_fee_usd=?,minimum_withdrawal_usd=?,collection_mode=?,collection_threshold=?,minimum_source=?,maximum_network_fee=?,aml_disabled=?,updated_by=? WHERE currency=?',[policy.deposits_enabled?1:0,policy.withdrawals_enabled?1:0,policy.withdrawal_fee_usd,policy.minimum_withdrawal_usd,policy.collection_mode,policy.collection_threshold,policy.minimum_source,policy.maximum_network_fee,policy.aml_disabled?1:0,actor,currency]);
  await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'NATIVE_POLICY',?)",[actor,currency,JSON.stringify(policy)]);
 });return nativeOverview();
}
export async function createNativeVaults(actor){
 await transact(async c=>{
  await c.query('SELECT currency FROM native_chain_policy ORDER BY currency FOR UPDATE');
  for(const currency of ['BTC','ETH']){
   const [[exists]]=await c.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[currency]);if(exists)continue;
   const secret=Wallet.createRandom().privateKey,address=nativeKeyAddress(currency,secret);
   await c.execute('INSERT INTO treasury_collection_wallets(network,currency,address,encrypted_key,created_by) VALUES(?,?,?,?,?)',[currency,currency,address,encryptWalletPrivateKey(secret,0,`TREASURY:${currency}`),actor]);
   await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'WALLET_CREATED',?)",[actor,currency,JSON.stringify({address})]);
  }
 });return nativeOverview();
}
async function ownFees(wallet){
 const [[deposit]]=await db.execute('SELECT COALESCE(SUM(l.amount),0) amount FROM admin_treasury_ledger l JOIN blockchain_deposits d ON d.id=l.deposit_id WHERE d.wallet_id=? AND d.to_address=? AND d.credited_at IS NOT NULL',[wallet.id,wallet.address]);
 const [[other]]=await db.execute('SELECT COALESCE(SUM(amount),0) amount FROM native_fee_ledger WHERE wallet_id=? AND currency=?',[wallet.id,wallet.currency]);
 const result=new Decimal(deposit.amount).plus(other.amount);if(result.lt(0))fail('Нужна сверка происхождения комиссии','FEE_LEDGER_MISMATCH');return atomic(result.toFixed(),wallet.currency);
}
async function inspectWallet(walletId,currency){
 const [[w]]=await db.execute('SELECT w.id,w.user_id,w.currency,w.address,w.balance,w.locked_balance,w.collection_lock_id,w.status,u.status user_status FROM wallets w JOIN users u ON u.id=w.user_id WHERE w.id=? AND w.currency=?',[walletId,currency]);
 if(!w||!w.address||w.status!=='active'||w.user_status!=='active')fail('Активный кошелёк не найден','SOURCE_NOT_READY');
 if(w.collection_lock_id||atomic(w.locked_balance||'0',currency)>0n)fail('Кошелёк занят другой операцией','SOURCE_BUSY');
 const [[cooldown]]=await db.execute("SELECT f.id FROM native_fee_ledger f JOIN native_chain_jobs j ON j.id=f.job_id WHERE f.wallet_id=? AND j.kind='collection' AND j.status='failed' AND j.updated_at>DATE_SUB(NOW(),INTERVAL 1 HOUR) LIMIT 1",[w.id]);if(cooldown)fail('Повторный сбор приостановлен на час после ошибки сети','SOURCE_COOLDOWN');
 const [[pending]]=await db.execute('SELECT id FROM blockchain_deposits WHERE wallet_id=? AND credited_at IS NULL LIMIT 1',[w.id]);if(pending)fail('Есть депозит на AML-проверке','AML_PENDING');
 const [[internal]]=await db.execute("SELECT id FROM transactions WHERE currency=? AND type='internal' AND (wallet_id=? OR from_address=? OR to_address=?) LIMIT 1",[currency,w.id,w.address,w.address]);
 if(internal)fail('История внутренних переводов требует адресной сверки','PROVENANCE_REVIEW');
 const chain=await sourceChain(currency,w.address),earned=await ownFees(w);
 proveCustody(BigInt(chain.balance),atomic(w.balance,currency),earned);
 return {walletId:w.id,userId:w.user_id,address:w.address,balance:w.balance,earned:earned.toString(),chain};
}
async function policyFor(currency){
 if(!nativeConfigured()||!['BTC','ETH'].includes(currency))fail('Процессинг BTC/ETH выключен','NOT_CONFIGURED',503);
 const [[policy]]=await db.execute('SELECT * FROM native_chain_policy WHERE currency=?',[currency]);if(!policy)fail('Настройки сети не найдены');return policy;
}
async function storePlan(plan,actor,user,key){
 if(!/^[\w-]{16,100}$/.test(key||''))fail('Некорректный ключ запроса','INVALID_REQUEST_KEY',400);
 const [[old]]=await db.execute('SELECT id,user_id,actor_id,kind,currency,plan_json FROM native_chain_jobs WHERE request_key=?',[key]);
 if(old){const previous=parse(old.plan_json);if(String(old.user_id)!==String(user)||String(old.actor_id)!==String(actor)||old.kind!==plan.kind||old.currency!==plan.currency||plan.kind==='withdrawal'&&(previous.amount!==plan.amount||previous.outputs[0].address!==plan.outputs[0].address))fail('Ключ запроса уже используется для другого расчёта');return nativePlan(old.id,user,actor);}
 const id=randomUUID();await db.execute('INSERT INTO native_chain_jobs(id,currency,kind,user_id,actor_id,request_key,plan_json,expires_at) VALUES(?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 60 SECOND))',[id,plan.currency,plan.kind,user,actor,key,JSON.stringify(plan)]);
 return nativePlan(id,user,actor);
}
export async function nativePlan(id,user=null,actor=null){
 const [[row]]=await db.execute('SELECT id,user_id,actor_id,status,currency,kind,plan_json,tx_hash,expires_at FROM native_chain_jobs WHERE id=?',[id]);if(!row)fail('Расчёт не найден');
 if(String(row.user_id)!==String(user)||String(row.actor_id)!==String(actor))fail('Нет доступа к операции','FORBIDDEN',403);
 const p=parse(row.plan_json);
 return {id,status:row.status,currency:row.currency,kind:row.kind,expiresAt:row.expires_at,txHash:row.tx_hash,amount:p.amount?nativeAmount(p.amount,p.currency):null,serviceFee:nativeAmount(p.serviceFee||'0',p.currency),networkFee:nativeAmount(p.cost?.fee||'0',p.currency),total:nativeAmount(p.total||p.gross||'0',p.currency),received:nativeAmount(p.outputs[0]?.value||'0',p.currency),sources:p.sources.map(s=>({userId:s.userId,address:s.address,fee:nativeAmount(s.gross||'0',p.currency)})),skipped:p.skipped||[]};
}
export async function quoteNativeWithdrawal(user,currency,address,value,key){
 const policy=await policyFor(currency);if(!policy.withdrawals_enabled)fail('Вывод этой валюты выключен');
 const [[account]]=await db.execute('SELECT id,status,withdrawals_enabled FROM users WHERE id=?',[user]);if(account?.status!=='active'||!account.withdrawals_enabled)fail('Вывод для аккаунта выключен','FORBIDDEN',403);
 const [[w]]=await db.execute('SELECT id FROM wallets WHERE user_id=? AND currency=?',[user,currency]);if(!w)fail('Кошелёк не найден');
 const to=nativeAddress(currency,String(address||'').trim()),source=await inspectWallet(w.id,currency);
 const [[managed]]=await db.execute('SELECT id FROM wallets WHERE LOWER(address)=LOWER(?) LIMIT 1',[to]);
 const [[vault]]=await db.execute('SELECT network FROM treasury_collection_wallets WHERE LOWER(address)=LOWER(?) LIMIT 1',[to]);
 if(managed||vault)fail('Для адресов Goblin используйте внутренний перевод','MANAGED_DESTINATION');
 const amount=atomic(value,currency),quote=await depositQuote(currency);
 if(new Decimal(value).mul(quote.price).lt(policy.minimum_withdrawal_usd))fail(`Минимальная сумма вывода — ${policy.minimum_withdrawal_usd} USDT`,'BELOW_MINIMUM');
 const serviceFee=atomic(new Decimal(policy.withdrawal_fee_usd).div(quote.price).toDecimalPlaces(currency==='BTC'?8:18,Decimal.ROUND_UP).toFixed(),currency);
 const cost=await nativeNetworkCost(currency,[source],[{address:to},{address:source.address}]);
 if(BigInt(cost.fee)>atomic(policy.maximum_network_fee,currency))fail('Стоимость сети выше лимита, повторите позже','NETWORK_FEE_LIMIT');
 const total=withdrawalTotals(amount,serviceFee,BigInt(cost.fee),atomic(source.balance,currency));
 const outputs=[{address:to,value:amount.toString()}];
 if(currency==='BTC'){const change=BigInt(source.chain.balance)-amount-BigInt(cost.fee);if(change>0n)outputs.push({address:source.address,value:change.toString()});}
 return storePlan({currency,kind:'withdrawal',sources:[source],outputs,cost,amount:amount.toString(),serviceFee:serviceFee.toString(),total:total.toString(),policy},null,user,key);
}
export async function previewNativeCollection(currency,actor,key=randomUUID()){
 const policy=await policyFor(currency);
 const [[vault]]=await db.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[currency]);if(!vault)fail('Создайте кошелёк сбора');
 const [owners]=await db.execute(`SELECT DISTINCT wallet_id FROM (
 SELECT d.wallet_id FROM admin_treasury_ledger l JOIN blockchain_deposits d ON d.id=l.deposit_id WHERE l.currency=?
 UNION SELECT wallet_id FROM native_fee_ledger WHERE currency=?
 ) sources ORDER BY wallet_id LIMIT 100`,[currency,currency]);
 const sources=[],skipped=[];
 for(const row of owners){
  try{const source=await inspectWallet(row.wallet_id,currency);if(BigInt(source.earned)<atomic(policy.minimum_source,currency))fail('Ниже минимума сбора','BELOW_SOURCE_MINIMUM');
   sources.push({...source,gross:source.earned});if(sources.length>=(currency==='BTC'?10:1))break;
  }catch(e){skipped.push({walletId:row.wallet_id,reason:e.code||'PROVIDER_UNAVAILABLE'});}
 }
 if(!sources.length)return {empty:true,currency,skipped};
 const gross=sources.reduce((s,w)=>s+BigInt(w.gross),0n);
 const outputs=[{address:vault.address,value:'0'}];
 if(currency==='BTC')for(const s of sources){const change=BigInt(s.chain.balance)-BigInt(s.gross);if(change>0n)outputs.push({address:s.address,value:change.toString()});}
 const cost=await nativeNetworkCost(currency,sources,outputs),fee=BigInt(cost.fee);
 if(fee>atomic(policy.maximum_network_fee,currency)||gross<=fee||fee*100n>gross*30n)fail('Сбор неэкономичен: расходы выше лимита или 30% комиссии','UNECONOMICAL');
 outputs[0].value=(gross-fee).toString();
 const [[treasury]]=await db.execute('SELECT balance FROM admin_treasury WHERE currency=?',[currency]);
 const [[collected]]=await db.execute("SELECT COALESCE(SUM(received),0) amount FROM native_chain_jobs WHERE currency=? AND kind='collection' AND status='confirmed'",[currency]);
 if(atomic(treasury?.balance||'0',currency)-atomic(collected.amount,currency)<gross)fail('Нужна сверка доступной комиссии казны','TREASURY_MISMATCH');
 return storePlan({currency,kind:'collection',sources,outputs,cost,gross:gross.toString(),skipped,policy},actor,null,key);
}
export async function executeNativePlan(id,user=null,actor=null){return exclusive(async()=>{
 const [[job]]=await db.execute('SELECT *,expires_at>NOW() fresh FROM native_chain_jobs WHERE id=?',[id]);if(!job)fail('Расчёт не найден');
 if(String(job.user_id)!==String(user)||String(job.actor_id)!==String(actor))fail('Нет доступа','FORBIDDEN',403);
 if(job.status!=='draft')return nativePlan(id,user,actor);
 if(!job.fresh)fail('Расчёт устарел, пересчитайте');
 const plan=parse(job.plan_json),policy=await policyFor(job.currency);
 if(job.kind==='withdrawal'&&!policy.withdrawals_enabled)fail('Вывод выключен');
 if(actor===null&&user===null&&policy.collection_mode!=='threshold')fail('Автоматический сбор выключен');
 if(!sameNativePolicy(policy,plan.policy))fail('Настройки изменились. Пересчитайте операцию.');
 if(job.kind==='collection'){
  const [[treasury]]=await db.execute('SELECT balance FROM admin_treasury WHERE currency=?',[job.currency]);
  const [other]=await db.execute("SELECT status,received,plan_json FROM native_chain_jobs WHERE currency=? AND kind='collection' AND status IN ('prepared','submitted','review','confirmed')",[job.currency]);
  const unavailable=other.reduce((s,j)=>s+(j.status==='confirmed'?atomic(j.received||'0',job.currency):BigInt(parse(j.plan_json).gross)),0n);
  if(atomic(treasury?.balance||'0',job.currency)-unavailable<BigInt(plan.gross))fail('Комиссия казны уже занята другим сбором','TREASURY_BUSY');
 }
 for(const s of plan.sources){const now=await inspectWallet(s.walletId,job.currency);if(now.balance!==s.balance||now.earned!==s.earned||!sameNativeChain(now.chain,s.chain))fail('Баланс сети изменился. Пересчитайте.','SOURCE_CHANGED');}
 const currentCost=await nativeNetworkCost(job.currency,plan.sources,plan.outputs);
 if(BigInt(currentCost.fee)>BigInt(plan.cost.fee))fail('Комиссия сети выросла, пересчитайте','FEE_CHANGED');
 await transact(async c=>{
  const [[current]]=await c.execute('SELECT status FROM native_chain_jobs WHERE id=? FOR UPDATE',[id]);if(current.status!=='draft')fail('Операция уже обрабатывается');
  const keys=[];
  for(const s of plan.sources){
   const [[w]]=await c.execute('SELECT w.*,u.status user_status,u.withdrawals_enabled FROM wallets w JOIN users u ON u.id=w.user_id WHERE w.id=? FOR UPDATE',[s.walletId]);
   if(w.status!=='active'||w.user_status!=='active'||w.collection_lock_id||new Decimal(w.locked_balance||0).gt(0)||!new Decimal(w.balance).eq(s.balance)||w.address!==s.address)fail('Состояние кошелька изменилось');
   if(job.kind==='withdrawal'&&!w.withdrawals_enabled)fail('Вывод отключён для аккаунта');
   if(job.kind==='withdrawal')await c.execute('UPDATE wallets SET locked_balance=locked_balance+? WHERE id=?',[nativeAmount(plan.total,job.currency),w.id]);
   await c.execute('UPDATE wallets SET collection_lock_id=? WHERE id=?',[id,w.id]);
   keys.push(decryptWalletPrivateKey(w.private_key,w.user_id,job.currency));
  }
  const signed=await buildNativeTransaction(plan,keys);
  await c.execute("UPDATE native_chain_jobs SET status='prepared',signed_hex=?,tx_hash=? WHERE id=?",[signed.hex,signed.hash,id]);
 });
 const [[prepared]]=await db.execute('SELECT * FROM native_chain_jobs WHERE id=?',[id]);
 try{await broadcastNative(prepared);await db.execute("UPDATE native_chain_jobs SET status='submitted' WHERE id=?",[id]);}catch{await db.execute("UPDATE native_chain_jobs SET error_code='BROADCAST_UNCERTAIN' WHERE id=?",[id]);}
 return nativePlan(id,user,actor);
});}
export async function settleNativeJob(job,receipt){
 const plan=parse(job.plan_json),currency=job.currency;
 if(receipt.fee<0n||receipt.fee>BigInt(plan.cost.fee))fail('Комиссия не соответствует резерву');
 await transact(async c=>{
  const [[row]]=await c.execute('SELECT status FROM native_chain_jobs WHERE id=? FOR UPDATE',[job.id]);if(!['prepared','submitted'].includes(row.status))return;
  let expense=receipt.fee;
  for(let i=0;i<plan.sources.length;i++){
   const s=plan.sources[i];
   const [[w]]=await c.execute('SELECT id,collection_lock_id FROM wallets WHERE id=? FOR UPDATE',[s.walletId]);if(w.collection_lock_id!==job.id)fail('Защита источника не найдена');
   await c.execute('UPDATE wallets SET collection_lock_id=NULL WHERE id=?',[s.walletId]);
   if(job.kind==='withdrawal'){
    const service=receipt.success?BigInt(plan.serviceFee):0n,spent=(receipt.success?BigInt(plan.amount):0n)+service+receipt.fee;
    const [r]=await c.execute('UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-? WHERE id=? AND balance>=? AND locked_balance>=?',[nativeAmount(spent,currency),nativeAmount(plan.total,currency),s.walletId,nativeAmount(spent,currency),nativeAmount(plan.total,currency)]);if(r.affectedRows!==1)fail('Резерв вывода не сходится');
    if(service>0n){await c.execute("INSERT INTO native_fee_ledger(job_id,wallet_id,currency,kind,amount) VALUES(?,?,?,'withdrawal',?)",[job.id,s.walletId,currency,nativeAmount(service,currency)]);await c.execute('INSERT INTO admin_treasury(currency,balance) VALUES(?,?) ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)',[currency,nativeAmount(service,currency)]);}
    if(receipt.success)await c.execute("INSERT INTO transactions(wallet_id,tx_hash,from_address,to_address,amount,currency,type) VALUES(?,?,?,?,?,?,'withdrawal')",[s.walletId,job.tx_hash,s.address,plan.outputs[0].address,nativeAmount(plan.amount,currency),currency]);
   }else{
    const gross=BigInt(s.gross),fee=i===plan.sources.length-1?expense:receipt.fee*gross/BigInt(plan.gross);expense-=fee;
    const spent=receipt.success?gross:fee;
    await c.execute("INSERT INTO native_fee_ledger(job_id,wallet_id,currency,kind,amount) VALUES(?,?,?,'collection',?)",[job.id,s.walletId,currency,nativeAmount(-spent,currency)]);
   }
  }
  if(job.kind==='collection'&&receipt.fee>0n){const fee=nativeAmount(receipt.fee,currency);const [r]=await c.execute('UPDATE admin_treasury SET balance=balance-? WHERE currency=? AND balance>=?',[fee,currency,fee]);if(r.affectedRows!==1)fail('Казна не покрывает расходы сети');}
  await c.execute('UPDATE native_chain_jobs SET status=?,network_fee=?,received=?,signed_hex=NULL,error_code=NULL WHERE id=?',[receipt.success?'confirmed':'failed',nativeAmount(receipt.fee,currency),receipt.success?nativeAmount(plan.outputs[0].value,currency):'0',job.id]);
 });
}
export async function recheckNativeJob(id,actor){return exclusive(async()=>{
 const [[job]]=await db.execute('SELECT status,tx_hash FROM native_chain_jobs WHERE id=?',[id]);if(!job?.tx_hash||!['review','prepared','submitted'].includes(job.status))fail('Операция не требует сверки');
 await db.execute("UPDATE native_chain_jobs SET status='submitted',error_code=NULL WHERE id=?",[id]);
 await db.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,'NATIVE','RECHECK_REQUESTED',?)",[actor,JSON.stringify({id})]);return {success:true};
});}
export async function runNativeJobs(){
 if(!nativeConfigured())return;
 return exclusive(async()=>{
  const [jobs]=await db.query("SELECT * FROM native_chain_jobs WHERE status IN ('prepared','submitted') ORDER BY created_at LIMIT 20");
  for(const job of jobs)try{
   const receipt=await nativeReceipt(job,parse(job.plan_json));
   if(receipt)await settleNativeJob(job,receipt);
   else{
    if(Date.now()-new Date(job.created_at).getTime()>86400000){await db.execute("UPDATE native_chain_jobs SET status='review',error_code='CONFIRMATION_REVIEW' WHERE id=?",[job.id]);continue;}
    try{await broadcastNative(job);}catch{/* Only identical signed bytes may be rebroadcast. */}
   }
  }catch(e){await db.execute('UPDATE native_chain_jobs SET error_code=? WHERE id=?',[e.code||'RECONCILIATION_RETRY',job.id]);}
 });
}
export async function runNativeThresholds(){
 if(!nativeConfigured())return;
 const [policies]=await db.query("SELECT * FROM native_chain_policy WHERE collection_mode='threshold'");
 for(const p of policies){
  const [[pending]]=await db.execute(`SELECT id FROM native_chain_jobs WHERE currency=? AND status IN ${active} LIMIT 1`,[p.currency]);if(pending)continue;
  const [[treasury]]=await db.execute('SELECT balance FROM admin_treasury WHERE currency=?',[p.currency]);
  const [[collected]]=await db.execute("SELECT COALESCE(SUM(received),0) amount FROM native_chain_jobs WHERE currency=? AND kind='collection' AND status='confirmed'",[p.currency]);
  if(new Decimal(treasury?.balance||0).minus(collected.amount).lt(p.collection_threshold))continue;
  try{const plan=await previewNativeCollection(p.currency,null);if(!plan.empty)await executeNativePlan(plan.id);}catch{/* Failed readiness is not authority to move funds. */}
 }
}
