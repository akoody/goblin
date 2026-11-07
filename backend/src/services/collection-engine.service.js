import {randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {decryptWalletPrivateKey} from './wallet-generator.service.js';
import {createTronWeb,broadcastTronTransaction} from './tron.service.js';
import {collectionUnits,collectionNative,reconcileOwnedFunds,collectionSettlement} from './collection-math.js';
import {collectionChainBalance,estimateCollectionFee,buildCollection,broadcastCollection,collectionReceipt,gasGrantReceipt} from './collection-network.js';
import {safeAtomic} from './solana-client.js';
const active="('queued','preparing','prepared','submitted','review')";
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const fail=(message,code='COLLECTION_BLOCKED')=>{throw Object.assign(new Error(message),{status:409,code});};
export const collectionReady=network=>process.env.TREASURY_COLLECTION_PAUSED!=='true'&&(network==='TRON'?Boolean(process.env.TRONGRID_API_KEY):Boolean(process.env.SOLANA_RPC_URL));
async function sourceFees(c,userId,network,address){
 const currency=network==='TRON'?'USDT':'SOL';
 const [[deposits]]=await c.execute(`SELECT COALESCE(SUM(l.amount),0) AS amount FROM admin_treasury_ledger l JOIN blockchain_deposits d ON d.id=l.deposit_id JOIN wallets w ON w.id=d.wallet_id WHERE w.user_id=? AND d.to_address=? AND d.network=? AND l.currency=?`,[userId,address,network,currency]);
 let earned=new Decimal(deposits.amount);
 if(network==='SOLANA'){const [[pump]]=await c.execute('SELECT COALESCE(SUM(f.amount_sol),0) AS amount FROM pump_fee_ledger f JOIN pump_launches p ON p.id=f.launch_id JOIN solana_accounts a ON a.user_id=f.user_id WHERE f.user_id=? AND a.address=? AND p.status=\'completed\'',[userId,address]);earned=earned.plus(pump.amount);}
 const [[spent]]=await c.execute(`SELECT COALESCE(SUM(CASE WHEN status='completed' THEN amount WHEN status='failed' AND network='SOLANA' THEN fee_charged ELSE 0 END),0) AS amount FROM treasury_collection_jobs WHERE source_address=? AND network=?`,[address,network]);
 return Decimal.max(0,earned.minus(spent.amount));
}
async function sourceGas(c,userId,address){
 const [[earned]]=await c.execute("SELECT COALESCE(SUM(l.amount),0) AS amount FROM admin_treasury_ledger l JOIN blockchain_deposits d ON d.id=l.deposit_id JOIN wallets w ON w.id=d.wallet_id WHERE w.user_id=? AND d.to_address=? AND l.currency='TRX'",[userId,address]);
 const [[funded]]=await c.execute("SELECT COALESCE(SUM(amount),0) AS amount FROM treasury_collection_gas_grants WHERE source_address=? AND status='confirmed'",[address]);
 const [[spent]]=await c.execute("SELECT COALESCE(SUM(fee_charged),0) AS amount FROM treasury_collection_jobs WHERE source_address=? AND network='TRON' AND status IN ('completed','failed')",[address]);
 const operational=new Decimal(funded.amount).minus(spent.amount);if(operational.lt(0))fail('Требуется сверка расходов газа','GAS_LEDGER_MISMATCH');
 return {earned:new Decimal(earned.amount),operational};
}
async function globalAvailable(c,network,excludedId=''){
 const currency=network==='TRON'?'USDT':'SOL';
 const [[treasury]]=await c.execute('SELECT balance FROM admin_treasury WHERE currency=?',[currency]);
 const [[held]]=await c.execute(`SELECT COALESCE(SUM(CASE WHEN status='completed' THEN received WHEN status IN ${active} THEN amount ELSE 0 END),0) AS amount FROM treasury_collection_jobs WHERE network=? AND id<>?`,[network,excludedId]);
 return Decimal.max(0,new Decimal(treasury?.balance||0).minus(held.amount));
}
async function inspectSource(c,userId,network,destination,excludedId=''){
 const [[recentFailure]]=await c.execute("SELECT id FROM treasury_collection_jobs WHERE user_id=? AND network=? AND status='failed' AND updated_at>DATE_SUB(NOW(),INTERVAL 1 HOUR) LIMIT 1",[userId,network]);
 if(recentFailure)fail('После ошибки сети повторный сбор доступен через час','SOURCE_COOLDOWN');
 const currencies=network==='TRON'?['USDT','TRX']:['SOL'];
 const [wallets]=await c.query(`SELECT id,user_id,currency,address,balance,locked_balance,private_key,collection_lock_id FROM wallets WHERE user_id=? AND currency IN (${currencies.map(()=>'?').join(',')}) ORDER BY id`,[userId,...currencies]);
 const wallet=wallets.find(w=>w.currency===currencies[0]);
 if(!wallet?.address||!wallet.private_key||wallet.address===destination||wallets.length!==currencies.length)fail('Кошелёк источника не готов','SOURCE_NOT_READY');
 if(wallets.some(w=>new Decimal(w.locked_balance||0).gt(0)||w.collection_lock_id&&w.collection_lock_id!==excludedId))fail('На кошельке есть резерв или другая консолидация','SOURCE_BUSY');
 if(excludedId&&wallets.some(w=>w.collection_lock_id!==excludedId))fail('Защита кошелька не установлена','SOURCE_CHANGED');
 const [[pending]]=await c.execute(`SELECT d.id FROM blockchain_deposits d JOIN wallets w ON w.id=d.wallet_id WHERE w.user_id=? AND d.network=? AND d.credited_at IS NULL LIMIT 1`,[userId,network]);if(pending)fail('Есть депозит, ожидающий проверки или зачисления','AML_OR_PENDING_DEPOSIT');
 const [[other]]=await c.execute(`SELECT id FROM treasury_collection_jobs WHERE user_id=? AND network=? AND id<>? AND status IN ${active} LIMIT 1`,[userId,network,excludedId]);if(other)fail('Предыдущий сбор ещё не завершён','SOURCE_BUSY');
 if(network==='TRON'){
  if(wallets.some(w=>w.address!==wallet.address))fail('TRX и USDT используют разные адреса','SOURCE_NOT_READY');
  const [[withdrawal]]=await c.execute("SELECT id FROM crypto_withdrawals WHERE user_id=? AND network='TRON' AND status IN ('prepared','broadcast') LIMIT 1",[userId]);
  const [[swap]]=await c.execute("SELECT id FROM tron_swaps WHERE user_id=? AND status IN ('active','review') LIMIT 1",[userId]);
  if(withdrawal||swap)fail('Ожидается завершение вывода или обмена','SOURCE_BUSY');
  // Existing P2P, escrow and internal transfers do not preserve address provenance.
  // Never infer ownership from a surplus on an account with that history.
  const [[transfer]]=await c.execute("SELECT t.id FROM transactions t JOIN users u ON u.id=? WHERE t.currency IN ('USDT','TRX') AND t.type='internal' AND (t.from_address=? OR t.to_address=? OR LOWER(t.to_address)=LOWER(u.email)) LIMIT 1",[userId,wallet.address,wallet.address]);
  const [[deal]]=await c.execute("SELECT id FROM deals WHERE (buyer_id=? OR seller_id=?) AND status='COMPLETED' LIMIT 1",[userId,userId]);
  const [[escrow]]=await c.execute("SELECT id FROM commerce_deals WHERE (buyer_id=? OR seller_id=?) AND funded_at IS NOT NULL LIMIT 1",[userId,userId]);
  if(transfer||deal||escrow)fail('История требует адресной сверки: внутренние переводы/P2P/гарант','PROVENANCE_REVIEW');
 }else{
  const [[swap]]=await c.execute("SELECT id FROM solana_swaps WHERE user_id=? AND status IN ('prepared','submitted','review') LIMIT 1",[userId]);
  const [[launch]]=await c.execute("SELECT id FROM pump_launches WHERE user_id=? AND status IN ('prepared','submitted','review') LIMIT 1",[userId]);
  if(swap||launch)fail('Ожидается завершение обмена или создания монеты','SOURCE_BUSY');
 }
 const earned=await sourceFees(c,userId,network,wallet.address);if(earned.lte(0))fail('Нет комиссии с подтверждённым источником','NO_ATTRIBUTED_FEES');
 const chain=await collectionChainBalance(network,wallet.address);
 reconcileOwnedFunds({chain:chain.asset,liability:collectionUnits(wallet.balance,network),earned:collectionUnits(earned,network)});
 let gas;
 if(network==='TRON'){
  gas=await sourceGas(c,userId,wallet.address);const trx=wallets.find(w=>w.currency==='TRX');
  reconcileOwnedFunds({chain:chain.gas,liability:collectionUnits(trx.balance,'TRON'),earned:collectionUnits(gas.earned.plus(gas.operational),'TRON')});
 }
 return {wallet,wallets,earned,gas};
}
export async function previewCollection(network,actorId,requestKey=randomUUID()){
 if(!['TRON','SOLANA'].includes(network))fail('Неизвестная сеть');
 const c=await db.getConnection();let held=false;try{const [[r]]=await c.query('SELECT GET_LOCK(?,0) AS ok',[`collection-preview-${network}`]);held=Number(r.ok)===1;if(!held)fail('Расчёт этой сети уже идёт. Повторите после его завершения');return await buildPreview(network,actorId,requestKey);}finally{if(held)await c.query('SELECT RELEASE_LOCK(?)',[`collection-preview-${network}`]);c.release();}
}
async function buildPreview(network,actorId,requestKey){
 if(!['TRON','SOLANA'].includes(network)||!collectionReady(network))fail('Сеть не настроена или сбор приостановлен','NETWORK_UNAVAILABLE');
 if(!/^[\w-]{16,128}$/.test(requestKey))fail('Некорректный ключ запроса');
 const [[existing]]=await db.execute('SELECT id,network,actor_id FROM treasury_collection_plans WHERE request_key=?',[requestKey]);if(existing){if(existing.network!==network||String(existing.actor_id)!==String(actorId))fail('Ключ запроса уже использован');return collectionPlan(existing.id);}
 const [[policy]]=await db.execute('SELECT * FROM treasury_collection_policy WHERE network=?',[network]);
 const [[vault]]=await db.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[network]);if(!vault)fail('Создайте кошелёк сбора');
 const ownersSql=`SELECT DISTINCT user_id FROM (
 SELECT l.user_id FROM admin_treasury_ledger l WHERE l.currency=?
 UNION SELECT f.user_id FROM pump_fee_ledger f WHERE ?='SOLANA'
 ) owners WHERE user_id>? ORDER BY user_id LIMIT 50`;
 let [users]=await db.query(ownersSql,[network==='TRON'?'USDT':'SOL',network,policy.scan_cursor||0]);
 if(!users.length&&Number(policy.scan_cursor)>0)[users]=await db.query(ownersSql,[network==='TRON'?'USDT':'SOL',network,0]);
 const entries=[];let available=await globalAvailable(db,network);
 for(const user of users){
  try{
   const source=await inspectSource(db,user.user_id,network,vault.address);
   const amount=Decimal.min(source.earned,available).toDecimalPlaces(network==='TRON'?6:9,Decimal.ROUND_DOWN);
   if(amount.lt(policy.minimum_source_amount))fail('Сумма на адресе ниже минимальной','BELOW_SOURCE_MINIMUM');
   let fee;try{fee=await estimateCollectionFee({network,source_address:source.wallet.address,destination_address:vault.address,amount:amount.toFixed()});}catch(e){if(network!=='TRON')throw e;fee=new Decimal(policy.maximum_network_fee).toFixed(6);}
   if(new Decimal(fee).gt(policy.maximum_network_fee)||network==='SOLANA'&&amount.lte(fee)||network==='TRON'&&new Decimal(fee).lte(2))fail('Сетевые расходы выше лимита или суммы сбора','NETWORK_FEE_LIMIT');
   entries.push({userId:user.user_id,walletId:source.wallet.id,address:source.wallet.address,amount:amount.toFixed(network==='TRON'?6:9),feeBudget:fee,ready:true,gasFunding:network==='TRON'?Decimal.max(0,new Decimal(fee).minus(source.gas.operational)).toFixed(6):'0'});
   available=available.minus(amount);
  }catch(e){entries.push({userId:user.user_id,ready:false,reason:e.code||'PROVIDER_UNAVAILABLE'});}
 }
 await db.execute('UPDATE treasury_collection_policy SET scan_cursor=? WHERE network=?',[users.length?users.at(-1).user_id:0,network]);
 const id=randomUUID();await db.execute('INSERT INTO treasury_collection_plans(id,network,actor_id,request_key,policy_json,entries_json,expires_at) VALUES(?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 60 SECOND))',[id,network,actorId,requestKey,JSON.stringify(policy),JSON.stringify(entries)]);
 return collectionPlan(id);
}
export async function collectionPlan(id){
 const [[row]]=await db.execute('SELECT id,network,status,entries_json,expires_at FROM treasury_collection_plans WHERE id=?',[id]);if(!row)fail('План не найден');
 const entries=parse(row.entries_json);return {id:row.id,network:row.network,status:row.status,expiresAt:row.expires_at,entries,total:entries.filter(e=>e.ready).reduce((s,e)=>s.plus(e.amount),new Decimal(0)).toFixed(),gasFunding:entries.filter(e=>e.ready).reduce((s,e)=>s.plus(e.gasFunding||0),new Decimal(0)).toFixed()};
}
export async function queueCollection(id,actorId){
 await transact(async c=>{
  const [[plan]]=await c.execute('SELECT *,expires_at>NOW() AS fresh FROM treasury_collection_plans WHERE id=? FOR UPDATE',[id]);if(!plan)fail('План не найден');if(plan.status==='queued')return;if(!plan.fresh)fail('План устарел. Рассчитайте заново');
  if(plan.actor_id!=null&&String(plan.actor_id)!==String(actorId))fail('План принадлежит другому администратору');
  if(!collectionReady(plan.network))fail('Сбор приостановлен');
  const [[policy]]=await c.execute('SELECT * FROM treasury_collection_policy WHERE network=? FOR UPDATE',[plan.network]);
  const old=parse(plan.policy_json);if(policy.mode!==old.mode||!new Decimal(policy.maximum_network_fee).eq(old.maximum_network_fee)||!new Decimal(policy.minimum_source_amount).eq(old.minimum_source_amount)||!new Decimal(policy.threshold_amount).eq(old.threshold_amount))fail('Настройки изменились. Рассчитайте заново');
  const [[vault]]=await c.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[plan.network]);
  const entries=parse(plan.entries_json).filter(e=>e.ready);if(!entries.length)fail('Нет адресов с безопасно доступной комиссией');
  const [[running]]=await c.execute(`SELECT id FROM treasury_collection_jobs WHERE network=? AND status IN ${active} LIMIT 1`,[plan.network]);if(running)fail('Дождитесь завершения предыдущего пакета в этой сети');
  if(plan.network==='TRON'){
   const required=entries.reduce((sum,e)=>sum.plus(e.gasFunding||0).plus(new Decimal(e.gasFunding||0).gt(0)?3:0),new Decimal(0));
   if(safeAtomic(await createTronWeb().trx.getBalance(vault.address))<collectionUnits(required,'TRON'))fail(`Для всего пакета нужно до ${required.toFixed(6)} TRX на кошельке сбора`,'GAS_WALLET_EMPTY');
  }
  for(const entry of entries){
   const [wallets]=await c.query("SELECT id,collection_lock_id,locked_balance FROM wallets WHERE user_id=? AND currency IN (?,?) ORDER BY id FOR UPDATE",[entry.userId,plan.network==='TRON'?'USDT':'SOL',plan.network==='TRON'?'TRX':'SOL']);
   if(wallets.some(w=>w.collection_lock_id||new Decimal(w.locked_balance||0).gt(0)))fail('Кошелёк занят, рассчитайте план заново');
   await c.query('SELECT currency FROM admin_treasury ORDER BY currency FOR UPDATE');
   if((await globalAvailable(c,plan.network)).lt(entry.amount))fail('Изменилась доступная комиссия казны');
   const jobId=randomUUID();await c.execute(`INSERT INTO treasury_collection_jobs(id,plan_id,network,user_id,wallet_id,source_address,destination_address,amount,fee_budget,active_slot,status) VALUES(?,?,?,?,?,?,?,?,?,?,'queued')`,[jobId,id,plan.network,entry.userId,entry.walletId,entry.address,vault.address,entry.amount,entry.feeBudget,`${plan.network}:${entry.userId}`]);
  }
  await c.execute("UPDATE treasury_collection_plans SET status='queued' WHERE id=?",[id]);
  await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'COLLECTION_QUEUED',?)",[actorId,plan.network,JSON.stringify({planId:id})]);
 });return collectionPlan(id);
}
async function adminCollectionLock(fn){
 const c=await db.getConnection();let held=false;try{const [[r]]=await c.query("SELECT GET_LOCK('goblin-treasury-collection',0) AS ok");held=Number(r.ok)===1;if(!held)fail('Сбор сейчас обрабатывается, повторите после обновления истории');return await fn();}finally{if(held)await c.query("SELECT RELEASE_LOCK('goblin-treasury-collection')");c.release();}
}
export async function cancelCollectionJob(id,actorId){return adminCollectionLock(async()=>{
 const [[job]]=await db.execute('SELECT * FROM treasury_collection_jobs WHERE id=?',[id]);if(!job)fail('Операция не найдена');
 const [[grant]]=await db.execute("SELECT id FROM treasury_collection_gas_grants WHERE job_id=? AND status<>'confirmed'",[id]);
 if(job.tx_hash||grant)fail('Подписанная или ожидающая сеть операция не отменяется без сверки');
 if(!await releaseJob(job,'cancelled','ADMIN_CANCELLED'))fail('Статус изменился. Обновите историю');
 await db.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'JOB_CANCELLED',?)",[actorId,job.network,JSON.stringify({jobId:id})]);
 return {success:true};
});}
export async function recheckCollectionJob(id,actorId){return adminCollectionLock(async()=>{
 await transact(async c=>{
  const [[job]]=await c.execute('SELECT * FROM treasury_collection_jobs WHERE id=? FOR UPDATE',[id]);if(!job)fail('Операция не найдена');
  if(!['queued','preparing','prepared','submitted','review'].includes(job.status))fail('Операция уже завершена');
  await c.execute("UPDATE treasury_collection_gas_grants SET status='prepared' WHERE job_id=? AND status='review'",[id]);
  await c.execute("UPDATE treasury_collection_jobs SET status=?,error_code=NULL WHERE id=?",[job.tx_hash?'submitted':job.status==='queued'?'queued':'preparing',id]);
  await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'RECHECK_REQUESTED',?)",[actorId,job.network,JSON.stringify({jobId:id})]);
 });return {success:true};
});}
async function releaseJob(job,status,code){
 return transact(async c=>{const [[current]]=await c.execute('SELECT status FROM treasury_collection_jobs WHERE id=? FOR UPDATE',[job.id]);if(!['queued','preparing'].includes(current.status))return false;await c.execute('UPDATE wallets SET collection_lock_id=NULL WHERE collection_lock_id=?',[job.id]);await c.execute('UPDATE treasury_collection_jobs SET status=?,error_code=?,active_slot=NULL WHERE id=?',[status,code,job.id]);return true;});
}
export async function settleCollection(job,success,fee,status=success?'completed':'failed'){
 const result=collectionSettlement(job,success,fee);
 await transact(async c=>{
  const [[current]]=await c.execute('SELECT status FROM treasury_collection_jobs WHERE id=? FOR UPDATE',[job.id]);if(!['prepared','submitted'].includes(current.status))return;
  // Moving custody does not reduce treasury principal. Only SOL network loss is expensed here;
  // TRON gas comes from separately funded operational grants, never customer balances.
  if(job.network==='SOLANA'&&new Decimal(result.fee).gt(0)){const [r]=await c.execute("UPDATE admin_treasury SET balance=balance-? WHERE currency='SOL' AND balance>=?",[result.fee,result.fee]);if(!r.affectedRows)throw new Error('Treasury fee ledger mismatch');}
  await c.execute('UPDATE wallets SET collection_lock_id=NULL WHERE collection_lock_id=?',[job.id]);
  await c.execute('UPDATE treasury_collection_jobs SET status=?,received=?,fee_charged=?,active_slot=NULL,signed_transaction=NULL,error_code=NULL WHERE id=?',[status,result.received,result.fee,job.id]);
 });
}
async function ensureGas(job,source){
 const [[existing]]=await db.execute('SELECT * FROM treasury_collection_gas_grants WHERE job_id=?',[job.id]);
 if(existing){
  if(existing.status==='review')fail('Нужна проверка пополнения газа','GAS_GRANT_REVIEW');
  if(existing.status==='confirmed')return;
  const [[vault]]=await db.execute("SELECT address FROM treasury_collection_wallets WHERE network='TRON'");
  const receipt=await gasGrantReceipt(existing,vault.address);
  if(receipt.review){await db.execute("UPDATE treasury_collection_gas_grants SET status='review' WHERE id=?",[existing.id]);fail('Требуется проверка газа','GAS_GRANT_REVIEW');}
  if(receipt.pending){if(collectionReady('TRON'))try{await broadcastTronTransaction(parse(existing.signed_transaction));}catch{/* Persisted signature reconciles before retry. */}return false;}
  await db.execute("UPDATE treasury_collection_gas_grants SET status='confirmed',fee_charged=?,signed_transaction=NULL WHERE id=?",[receipt.fee,existing.id]);return;
 }
 const needed=Decimal.max(0,new Decimal(job.fee_budget).minus(source.gas.operational));if(needed.eq(0))return;
 const [[pending]]=await db.query("SELECT id FROM treasury_collection_gas_grants WHERE status IN ('prepared','review') LIMIT 1");if(pending)return false;
 const [[vault]]=await db.execute("SELECT * FROM treasury_collection_wallets WHERE network='TRON'");
 const key=decryptWalletPrivateKey(vault.encrypted_key,0,'TREASURY:TRON');
 if(createTronWeb().address.fromPrivateKey(key)!==vault.address)throw new Error('Gas vault signer mismatch');
 const t=createTronWeb(key),vaultBalance=safeAtomic(await t.trx.getBalance(vault.address));
 if(vaultBalance<collectionUnits(needed.plus(3),'TRON'))fail('Пополните кошелёк сбора TRX для газа и до 3 TRX на перевод газа','GAS_WALLET_EMPTY');
 const funding=await t.transactionBuilder.sendTrx(job.source_address,Number(collectionUnits(needed,'TRON')),vault.address);
 const signed=await t.trx.sign(funding,key);
 const grantId=randomUUID();await db.execute('INSERT INTO treasury_collection_gas_grants(id,job_id,source_address,amount,tx_hash,signed_transaction,expiry_time) VALUES(?,?,?,?,?,?,?)',[grantId,job.id,job.source_address,needed.toFixed(6),signed.txID,JSON.stringify(signed),signed.raw_data.expiration]);
 try{await broadcastTronTransaction(signed);}catch{/* Do not sign a replacement. */}return false;
}
async function processJob(job){
 if(job.status==='queued'){
  if(!collectionReady(job.network)){await releaseJob(job,'cancelled','COLLECTION_PAUSED');return;}
  if(job.network==='TRON'){const [[pending]]=await db.query("SELECT id FROM treasury_collection_gas_grants WHERE status IN ('prepared','review') LIMIT 1");if(pending)return;}
  await transact(async c=>{
   const [[current]]=await c.execute('SELECT status FROM treasury_collection_jobs WHERE id=? FOR UPDATE',[job.id]);if(current.status!=='queued')fail('Статус операции изменился');
   const [wallets]=await c.query('SELECT id,collection_lock_id,locked_balance FROM wallets WHERE user_id=? AND currency IN (?,?) ORDER BY id FOR UPDATE',[job.user_id,job.network==='TRON'?'USDT':'SOL',job.network==='TRON'?'TRX':'SOL']);
   if(wallets.some(w=>w.collection_lock_id||new Decimal(w.locked_balance||0).gt(0)))fail('Кошелёк занят','SOURCE_BUSY');
   await c.execute('UPDATE wallets SET collection_lock_id=? WHERE user_id=? AND currency IN (?,?)',[job.id,job.user_id,job.network==='TRON'?'USDT':'SOL',job.network==='TRON'?'TRX':'SOL']);
   await c.execute("UPDATE treasury_collection_jobs SET status='preparing' WHERE id=?",[job.id]);
  });job={...job,status:'preparing'};
 }
 if(job.status==='preparing'){
  const [[grant]]=await db.execute("SELECT status FROM treasury_collection_gas_grants WHERE job_id=? AND status<>'confirmed'",[job.id]);
  if(grant&&await ensureGas(job,null)===false)return;
  if(!collectionReady(job.network)){await releaseJob(job,'cancelled','COLLECTION_PAUSED');return;}
  const source=await inspectSource(db,job.user_id,job.network,job.destination_address,job.id);
  if(String(source.wallet.id)!==String(job.wallet_id)||source.wallet.address!==job.source_address||source.earned.lt(job.amount))fail('Изменился источник комиссии','SOURCE_CHANGED');
  const [[plan]]=await db.execute('SELECT actor_id FROM treasury_collection_plans WHERE id=?',[job.plan_id]);
  const [[policy]]=await db.execute('SELECT * FROM treasury_collection_policy WHERE network=?',[job.network]);
  if(plan.actor_id==null&&policy.mode!=='threshold')fail('Автоматический режим отключён','AUTO_DISABLED');
  if(new Decimal(job.fee_budget).gt(policy.maximum_network_fee)||new Decimal(job.amount).lt(policy.minimum_source_amount))fail('Изменились лимиты','POLICY_CHANGED');
  const key=decryptWalletPrivateKey(source.wallet.private_key,job.user_id,job.network==='TRON'?'USDT':'SOL');
  if(job.network==='TRON'&&createTronWeb().address.fromPrivateKey(key)!==job.source_address)fail('Не подтверждён ключ источника','SOURCE_KEY_MISMATCH');
  if(job.network==='TRON'&&await ensureGas(job,source)===false)return;
  const built=await buildCollection(job,key);
  const [persisted]=await db.execute("UPDATE treasury_collection_jobs SET status='prepared',tx_hash=?,signed_transaction=?,expiry_height=?,expiry_time=?,error_code=NULL WHERE id=? AND status='preparing'",[built.hash,built.signed,built.expiryHeight||null,built.expiryTime||null,job.id]);
  if(persisted.affectedRows!==1)throw new Error('Signed transaction was not persisted');
  job={...job,status:'prepared',tx_hash:built.hash,signed_transaction:built.signed,expiry_height:built.expiryHeight,expiry_time:built.expiryTime};
 }
 const receipt=await collectionReceipt(job);
 if(receipt.review){await db.execute("UPDATE treasury_collection_jobs SET status='review',error_code='RECEIPT_REVIEW' WHERE id=?",[job.id]);return;}
 if(receipt.expired){await settleCollection(job,false,'0','expired');return;}
 if(receipt.pending){if(collectionReady(job.network))try{await broadcastCollection(job);await db.execute("UPDATE treasury_collection_jobs SET status='submitted' WHERE id=? AND status='prepared'",[job.id]);}catch{await db.execute("UPDATE treasury_collection_jobs SET error_code='BROADCAST_UNCERTAIN' WHERE id=?",[job.id]);}return;}
 await settleCollection(job,receipt.success,receipt.fee);
}
let busy=false;
export async function runCollectionEngine(){
 if(busy)return;busy=true;let lock,acquired=false;
 try{
  lock=await db.getConnection();
  const [[result]]=await lock.query("SELECT GET_LOCK('goblin-treasury-collection',0) AS ok");acquired=Number(result.ok)===1;if(!acquired)return;
  const [jobs]=await db.query(`SELECT * FROM treasury_collection_jobs WHERE status IN ('queued','preparing','prepared','submitted') ORDER BY CASE WHEN status='queued' THEN 1 ELSE 0 END,created_at LIMIT 50`);
  for(const job of jobs)try{await processJob(job);}catch(e){
   const [[grant]]=await db.execute("SELECT status FROM treasury_collection_gas_grants WHERE job_id=? AND status<>'confirmed'",[job.id]);
   if(['queued','preparing'].includes(job.status)&&!grant)await releaseJob(job,'blocked',e.code||'PREPARATION_FAILED');
   else await db.execute('UPDATE treasury_collection_jobs SET error_code=? WHERE id=?',[e.code||'RECONCILIATION_RETRY',job.id]);
  }
  const [policies]=await db.query("SELECT * FROM treasury_collection_policy WHERE mode='threshold'");
  for(const p of policies){if(!collectionReady(p.network))continue;
   const [[pending]]=await db.execute(`SELECT id FROM treasury_collection_jobs WHERE network=? AND status IN ${active} LIMIT 1`,[p.network]);if(pending)continue;
   if((await globalAvailable(db,p.network)).lt(p.threshold_amount))continue;
   try{const plan=await previewCollection(p.network,null);if(new Decimal(plan.total).gte(p.threshold_amount))await queueCollection(plan.id,null);}catch{/* No signed transfer was submitted; retry after the next network scan. */}
  }
 }finally{try{if(acquired)await lock.query("SELECT RELEASE_LOCK('goblin-treasury-collection')");}finally{lock?.release();busy=false;}}
}
export function startCollectionEngine(){const run=()=>runCollectionEngine().catch(()=>console.error('Treasury collection scan deferred'));run();const timer=setInterval(run,30000);timer.unref?.();return timer;}
