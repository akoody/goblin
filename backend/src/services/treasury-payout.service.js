import {randomUUID} from 'node:crypto';
import DecimalBase from 'decimal.js';
const Decimal=DecimalBase.clone({precision:80});
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {decryptWalletPrivateKey} from './wallet-generator.service.js';
import {payoutAssets,payoutAmount,payoutAvailability,payoutPolicy} from './treasury-payout-policy.js';
import {payoutAddress,vaultChain,payoutQuote,signPayout,sendPayout,payoutReceipt} from './treasury-payout-chain.js';
import {tronRequestBudget} from './tron-request-budget.js';
import {tronPollSchedule} from './tron-poll-schedule.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value;
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const active="('prepared','submitted','review')";
export function createTreasuryPayoutService({database=db,transport={payoutAddress,vaultChain,payoutQuote,signPayout,sendPayout,payoutReceipt},transaction=transact,decrypt=decryptWalletPrivateKey}={}){
const db=database,transact=transaction,decryptWalletPrivateKey=decrypt;
const {payoutAddress,vaultChain,payoutQuote,signPayout,sendPayout,payoutReceipt}=transport;
async function exclusive(work){
 const connection=await db.getConnection();let locked=false;
 try{const [[row]]=await connection.query("SELECT GET_LOCK('goblin-treasury-collection',0) ok");locked=Number(row.ok)===1;if(!locked)fail('Казна занята сверкой или сбором. Повторите позже.');return await work();}
 finally{try{if(locked)await connection.query("SELECT RELEASE_LOCK('goblin-treasury-collection')");}finally{connection.release();}}
}
async function policyFor(currency){if(!Object.hasOwn(payoutAssets,currency))fail('Неизвестная валюта');const [[row]]=await db.execute('SELECT * FROM treasury_payout_policy WHERE currency=?',[currency]);if(!row)fail('Нет настроек казны');return row;}
async function payoutState(currency){
 const policy=await policyFor(currency),network=payoutAssets[currency].network;
 const [[vault]]=await db.execute('SELECT network,address FROM treasury_collection_wallets WHERE network=?',[network]);
 if(!vault)fail('Создайте кошелёк сбора');
 const [[book]]=await db.execute('SELECT balance FROM admin_treasury WHERE currency=?',[currency]);
 const [[collected]]=await db.execute(['BTC','ETH'].includes(currency)?"SELECT COALESCE(SUM(received),0) amount FROM native_chain_jobs WHERE currency=? AND kind='collection' AND status='confirmed'":"SELECT COALESCE(SUM(received),0) amount FROM treasury_collection_jobs WHERE network=? AND status='completed'",[['BTC','ETH'].includes(currency)?currency:network]);
 const [[payouts]]=await db.execute(`SELECT COALESCE(SUM(CASE WHEN status IN ('confirmed','failed') THEN CASE WHEN status='confirmed' THEN gross_amount WHEN currency='USDT' THEN 0 ELSE fee_charged END ELSE 0 END),0) spent, COALESCE(SUM(CASE WHEN status IN ${active} THEN gross_amount ELSE 0 END),0) reserved FROM treasury_payouts WHERE currency=?`,[currency]);
 const chain=await vaultChain(currency,vault.address,true);
 const available=payoutAvailability({collected:collected.amount,spent:payouts.spent,reserved:payouts.reserved,chain:chain.balance,book:book?.balance||'0'});
 return {currency,network,address:vault.address,bookBalance:String(book?.balance||0),collected:String(collected.amount),spent:String(payouts.spent),reserved:String(payouts.reserved),available,chainBalance:chain.balance,gasBalance:chain.gas,policy};
}
async function treasuryPayoutOverview(){
 const assets=await Promise.all(Object.keys(payoutAssets).map(async currency=>{try{return await payoutState(currency);}catch(error){const [[vault]]=await db.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[payoutAssets[currency].network]);const limited=currency==='USDT'&&tronRequestBudget.stats().blockedUntil>Date.now();return {currency,network:payoutAssets[currency].network,address:vault?.address,error:limited?'TRON API ограничил запросы. Проверка возобновится автоматически после паузы. Баланс не обновлён; вывод временно недоступен.':error.status?error.message:'Сеть временно недоступна',policy:await policyFor(currency)};}}));
 const [jobs]=await db.query('SELECT id,currency,status,destination,gross_amount,received_amount,fee_budget,fee_charged,tx_hash,error_code,created_at FROM treasury_payouts ORDER BY created_at DESC LIMIT 100');
 return {paused:process.env.TREASURY_PAYOUT_PAUSED==='true',assets,jobs,tronApi:tronRequestBudget.stats(),tronPolling:tronPollSchedule.stats()};
}
async function savePayoutPolicy(actor,currency,input){
 const policy=payoutPolicy(input,currency);
 if(policy.destination)policy.destination=payoutAddress(currency,policy.destination);
 await exclusive(()=>transact(async connection=>{
  const [[old]]=await connection.execute('SELECT currency,revision FROM treasury_payout_policy WHERE currency=? FOR UPDATE',[currency]);if(!old)fail('Нет настроек валюты');
  if(String(input.revision)!==String(old.revision))fail('Настройки изменил другой администратор. Обновите страницу перед сохранением.');
  await rejectManagedDestination(connection,policy.destination);
  await connection.execute('UPDATE treasury_payout_policy SET mode=?,destination=?,threshold_amount=?,maximum_amount=?,maximum_fee=?,gas_reserve=?,cooldown_seconds=?,revision=revision+1,updated_by=? WHERE currency=?',[policy.mode,policy.destination,policy.threshold,policy.maximumAmount,policy.maximumFee,policy.gasReserve,policy.cooldownSeconds,actor,currency]);
  await connection.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'PAYOUT_POLICY',?)",[actor,payoutAssets[currency].network,JSON.stringify(policy)]);
 }));
 return policyFor(currency);
}
async function rejectManagedDestination(connection,address){
 if(!address)return;
 const [[wallet]]=await connection.execute('SELECT id FROM wallets WHERE LOWER(address)=LOWER(?) LIMIT 1',[address]);
 const [[vault]]=await connection.execute('SELECT network FROM treasury_collection_wallets WHERE LOWER(address)=LOWER(?) LIMIT 1',[address]);
 const [[sol]]=await connection.execute('SELECT user_id FROM solana_accounts WHERE address=? LIMIT 1',[address]);
 if(wallet||vault||sol)fail('Укажите внешний адрес, не кошелёк Goblin');
}
async function preview(currency,actor,{amount,destination,requestKey=randomUUID()}){
 if(process.env.TREASURY_PAYOUT_PAUSED==='true')fail('Вывод казны приостановлен');
 if(!/^[\w-]{16,128}$/.test(requestKey))fail('Некорректный ключ запроса');
 const [[existing]]=await db.execute('SELECT id,actor_id,currency FROM treasury_payouts WHERE request_key=?',[requestKey]);
 if(existing){if(existing.currency!==currency||String(existing.actor_id)!==String(actor))fail('Ключ запроса уже использован');return payoutDetails(existing.id);}
 const state=await payoutState(currency),policy=state.policy;
 const value=payoutAmount(amount,currency),to=payoutAddress(currency,String(destination||policy.destination).trim());
 await rejectManagedDestination(db,to);
 const [[pending]]=await db.execute(`SELECT id FROM treasury_payouts WHERE currency=? AND status IN ${active} LIMIT 1`,[currency]);if(pending)fail('Дождитесь завершения предыдущего вывода');
 if(new Decimal(value).gt(policy.maximum_amount)||new Decimal(value).gt(state.available))fail('Сумма выше доступных средств или лимита одной выплаты');
 const nativeReserve=currency==='USDT'?new Decimal(0):new Decimal(policy.gas_reserve);
 if(new Decimal(value).plus(nativeReserve).gt(state.available))fail('Недостаточно средств с учётом остатка для газа');
 if(currency==='USDT'){
  const [[busy]]=await db.query("SELECT id FROM treasury_collection_jobs WHERE network='TRON' AND status IN ('queued','preparing','prepared','submitted','review') LIMIT 1");
  if(busy)fail('Дождитесь завершения сбора USDT и обеспечения газом');
  const [[grant]]=await db.query("SELECT id FROM treasury_collection_gas_grants WHERE status IN ('prepared','review') LIMIT 1");
  if(grant)fail('Дождитесь сверки предыдущего перевода TRX для газа');
 }
 const source={address:state.address,...await vaultChain(currency,state.address)};
 const quote=await payoutQuote(currency,source,to,value);
 if(new Decimal(quote.fee).gt(policy.maximum_fee))fail('Расходы сети выше настроенного лимита');
 if(currency==='USDT'&&new Decimal(source.gas||0).lt(new Decimal(quote.fee).plus(policy.gas_reserve)))fail('Пополните отдельный адрес казны TRX для сетевых расходов');
 const id=randomUUID(),plan={...quote,source:state.address,chainSnapshot:source,policyRevision:String(policy.revision)};
 await db.execute("INSERT INTO treasury_payouts(id,currency,actor_id,request_key,policy_revision,destination,gross_amount,received_amount,fee_budget,plan_json,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 60 SECOND))",[id,currency,actor,requestKey,policy.revision,to,value,quote.received,quote.fee,JSON.stringify(plan)]);
 return payoutDetails(id);
}
async function previewTreasuryPayout(currency,actor,input){return exclusive(()=>preview(currency,actor,input));}
async function payoutDetails(id){
 const [[row]]=await db.execute('SELECT id,currency,status,destination,gross_amount,received_amount,fee_budget,fee_charged,tx_hash,error_code,expires_at FROM treasury_payouts WHERE id=?',[id]);if(!row)fail('Выплата не найдена');return row;
}
async function execute(id,actor,automatic=false){
 const [[row]]=await db.execute('SELECT *,expires_at>NOW() fresh FROM treasury_payouts WHERE id=?',[id]);if(!row)fail('Выплата не найдена');
 if(row.status!=='preview')return payoutDetails(id);
 if(!row.fresh||process.env.TREASURY_PAYOUT_PAUSED==='true')fail('Расчёт истёк или отправка приостановлена');
 const policy=await policyFor(row.currency);if(String(policy.revision)!==String(row.policy_revision))fail('Настройки изменились, пересчитайте выплату');
 if(automatic&&policy.mode!=='threshold')fail('Автовывод отключён');
 const original=parse(row.plan_json);
 // Repeat all coverage and price checks immediately before signing, never trust a preview.
 const check=await preview(row.currency,actor,{amount:row.gross_amount,destination:row.destination});
 const [[verified]]=await db.execute('SELECT plan_json FROM treasury_payouts WHERE id=?',[check.id]);
 const plan=parse(verified.plan_json);
 if(new Decimal(plan.fee).gt(row.fee_budget)||new Decimal(plan.received).lt(row.received_amount))fail('Стоимость сети выросла. Пересчитайте выплату.');
 const [[vault]]=await db.execute('SELECT * FROM treasury_collection_wallets WHERE network=?',[payoutAssets[row.currency].network]);
 if(vault.address!==original.source)fail('Адрес казны изменился');
 const key=decryptWalletPrivateKey(vault.encrypted_key,0,`TREASURY:${payoutAssets[row.currency].network}`);
 const signed=await signPayout(plan,key);
 Object.assign(plan,{expiryTime:signed.expiryTime??null,expiryHeight:signed.expiryHeight??null});
 await transact(async connection=>{
  const [[locked]]=await connection.execute('SELECT status FROM treasury_payouts WHERE id=? FOR UPDATE',[id]);if(locked.status!=='preview')fail('Выплата уже подтверждена');
  const [reserve]=await connection.execute('UPDATE admin_treasury SET balance=balance-? WHERE currency=? AND balance>=?',[row.gross_amount,row.currency,row.gross_amount]);
  if(reserve.affectedRows!==1)fail('Доступный баланс казны изменился');
  await connection.execute("UPDATE treasury_payouts SET status='prepared',active_currency=currency,signed_transaction=?,tx_hash=?,plan_json=? WHERE id=?",[signed.signed,signed.hash,JSON.stringify(plan),id]);
  await connection.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'PAYOUT_PREPARED',?)",[actor,payoutAssets[row.currency].network,JSON.stringify({id,automatic})]);
 });
 try{await sendPayout({...row,signed_transaction:signed.signed,tx_hash:signed.hash},plan);await db.execute("UPDATE treasury_payouts SET status='submitted' WHERE id=? AND status='prepared'",[id]);}
 catch{await db.execute("UPDATE treasury_payouts SET error_code='BROADCAST_UNCERTAIN' WHERE id=?",[id]);}
 return payoutDetails(id);
}
async function executeTreasuryPayout(id,actor){return exclusive(()=>execute(id,actor));}
async function reconcile(row){
 const plan=parse(row.plan_json),receipt=await payoutReceipt(row,plan);
 if(receipt.review){await db.execute("UPDATE treasury_payouts SET status='review',error_code='RECEIPT_REVIEW' WHERE id=?",[row.id]);return;}
 if(receipt.pending){if(process.env.TREASURY_PAYOUT_PAUSED!=='true')try{await sendPayout(row,plan);}catch{/* Only the persisted signed bytes may be rebroadcast. */}return;}
 const fee=new Decimal(receipt.fee||0);if(fee.gt(row.fee_budget)||fee.lt(0))fail('Подтверждение превышает резерв комиссии');
 const success=receipt.success===true,status=receipt.expired?'cancelled':success?'confirmed':'failed';
 const spent=success?new Decimal(row.gross_amount):row.currency==='USDT'?new Decimal(0):fee;
 await transact(async connection=>{
  const [[current]]=await connection.execute('SELECT status FROM treasury_payouts WHERE id=? FOR UPDATE',[row.id]);if(!['prepared','submitted','review'].includes(current.status))return;
  const refund=new Decimal(row.gross_amount).minus(spent);
  if(refund.gt(0))await connection.execute('UPDATE admin_treasury SET balance=balance+? WHERE currency=?',[refund.toFixed(),row.currency]);
  await connection.execute('UPDATE treasury_payouts SET status=?,active_currency=NULL,fee_charged=?,received_amount=?,signed_transaction=NULL,error_code=NULL WHERE id=?',[status,fee.toFixed(),success?(row.currency==='USDT'?row.gross_amount:new Decimal(row.gross_amount).minus(fee).toFixed()):'0',row.id]);
 });
}
async function recheckTreasuryPayout(id){return exclusive(async()=>{const [[row]]=await db.execute(`SELECT * FROM treasury_payouts WHERE id=? AND status IN ${active}`,[id]);if(!row)fail('Нет незавершённой выплаты');await reconcile(row);return payoutDetails(id);});}
async function runTreasuryPayouts(){return exclusive(async()=>{
 const [jobs]=await db.query(`SELECT * FROM treasury_payouts WHERE status IN ('prepared','submitted') ORDER BY created_at LIMIT 4`);
 for(const row of jobs)try{await reconcile(row);}catch{await db.execute("UPDATE treasury_payouts SET error_code='RECONCILIATION_RETRY' WHERE id=?",[row.id]);}
 if(process.env.TREASURY_PAYOUT_PAUSED==='true')return;
 const [policies]=await db.query("SELECT * FROM treasury_payout_policy WHERE mode='threshold'");
 for(const policy of policies)try{
  const [[recent]]=await db.execute("SELECT id FROM treasury_payouts WHERE currency=? AND (status IN ('prepared','submitted','review') OR status<>'preview' AND updated_at>DATE_SUB(NOW(),INTERVAL ? SECOND)) LIMIT 1",[policy.currency,policy.cooldown_seconds]);if(recent)continue;
  const state=await payoutState(policy.currency);
  const available=new Decimal(state.available).minus(policy.currency==='USDT'?0:policy.gas_reserve);
  if(available.lt(policy.threshold_amount))continue;
  const plan=await preview(policy.currency,null,{amount:Decimal.min(available,policy.maximum_amount).toFixed(),destination:policy.destination});
  await execute(plan.id,null,true);
 }catch{/* Readiness failure never grants permission to use customer funds. */}
});}
function startTreasuryPayouts(){const run=()=>runTreasuryPayouts().catch(()=>console.error('Treasury payout cycle deferred'));run();const timer=setInterval(run,30000);timer.unref?.();return timer;}
return {payoutState,treasuryPayoutOverview,savePayoutPolicy,previewTreasuryPayout,payoutDetails,executeTreasuryPayout,recheckTreasuryPayout,runTreasuryPayouts,startTreasuryPayouts};
}
export const {payoutState,treasuryPayoutOverview,savePayoutPolicy,previewTreasuryPayout,payoutDetails,executeTreasuryPayout,recheckTreasuryPayout,runTreasuryPayouts,startTreasuryPayouts}=createTreasuryPayoutService();
