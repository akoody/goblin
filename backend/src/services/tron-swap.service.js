import {randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {decryptWalletPrivateKey} from './wallet-generator.service.js';
import {assertAccountFeature} from '../middleware/account-feature.js';
import {swapAmount,minOutput,tronWalletCompatibility,routerQuote,allowance,prepareSwapStep,swapReceiptOutput,tronSwapReady,units,native,getSolidTronReceipt,broadcastTronTransaction} from './tron-swap-client.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function tronSwapState(userId){
 const [wallets]=await db.execute("SELECT currency,balance,locked_balance FROM wallets WHERE user_id=? AND currency IN ('TRX','USDT') ORDER BY currency",[userId]);
 const [[policy]]=await db.query('SELECT * FROM tron_swap_policy WHERE id=1');
 const [swaps]=await db.execute('SELECT id,input_currency,input_amount,expected_output,minimum_output,actual_output,fee_charged,status,error_code,created_at FROM tron_swaps WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[userId]);
 const [transactions]=await db.execute('SELECT t.swap_id,t.step_index,t.tx_hash FROM tron_swap_transactions t JOIN tron_swaps s ON s.id=t.swap_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 150',[userId]);
 return {wallets,policy,ready:Boolean(policy.enabled)&&tronSwapReady(),swaps:swaps.map(s=>({...s,transactions:transactions.filter(t=>t.swap_id===s.id)}))};
}
export async function quoteTronSwap(userId,body){
 await assertAccountFeature(userId,'trading');
 if(!['TRX','USDT'].includes(body.currency))fail('Поддерживается TRX ↔ USDT');
 const amount=swapAmount(body.amount),slippage=Number(body.slippageBps??100),key=String(body.requestKey||'');
 if(!/^[\w-]{16,128}$/.test(key))fail('Некорректный ключ запроса');
 const [[policy]]=await db.query('SELECT * FROM tron_swap_policy WHERE id=1');
 if(!policy.enabled||!tronSwapReady())fail('Свап TRON ещё не включён',503);
 if(new Decimal(amount).lt(body.currency==='TRX'?policy.minimum_trx:policy.minimum_usdt))fail('Сумма ниже минимальной для свапа');
 const [wallets]=await db.execute("SELECT currency,address,private_key FROM wallets WHERE user_id=? AND currency IN ('TRX','USDT')",[userId]);
 const {address}=tronWalletCompatibility(wallets),output=await routerQuote(address,body.currency,amount),minimum=minOutput(output,slippage),id=randomUUID();
 if(BigInt(minimum)<=0n)fail('Слишком маленький результат обмена');
 const [r]=await db.execute(`INSERT IGNORE INTO tron_swaps(id,user_id,request_key,input_currency,input_amount,expected_output,minimum_output,address,quote_expires_at) VALUES(?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 45 SECOND))`,[id,userId,key,body.currency,amount,native(output),native(minimum),address]);
 if(!r.affectedRows)fail('Запрос уже использован',409);
 return {id,inputCurrency:body.currency,outputCurrency:body.currency==='TRX'?'USDT':'TRX',inputAmount:amount,outputAmount:native(output),minimumOutput:native(minimum),feeBudget:policy.fee_budget_trx,expiresIn:45};
}
export async function reserveTronSwap(userId,id){
 await assertAccountFeature(userId,'trading');
 if(!tronSwapReady())fail('Подпись свапов TRON выключена',503);
 return transact(async c=>{
  const [[user]]=await c.execute('SELECT status,trading_enabled,withdrawals_enabled FROM users WHERE id=? FOR UPDATE',[userId]);
  if(user?.status!=='active'||!user.trading_enabled||!user.withdrawals_enabled)fail('Обмен для аккаунта отключён',403);
  const [[job]]=await c.execute('SELECT *,quote_expires_at>NOW() AS fresh FROM tron_swaps WHERE id=? AND user_id=? FOR UPDATE',[id,userId]);
  if(!job)fail('Котировка не найдена',404);
  if(job.status!=='quoted')return {id,status:job.status};
  if(!job.fresh)fail('Котировка истекла',409);
  const [[policy]]=await c.query('SELECT * FROM tron_swap_policy WHERE id=1 FOR UPDATE');
  if(!policy.enabled||new Decimal(job.input_amount).lt(job.input_currency==='TRX'?policy.minimum_trx:policy.minimum_usdt))fail('Условия свапа изменились',409);
  const [wallets]=await c.execute("SELECT * FROM wallets WHERE user_id=? AND currency IN ('TRX','USDT') ORDER BY currency FOR UPDATE",[userId]);
  const pair=tronWalletCompatibility(wallets);
  if(pair.address!==job.address)fail('Адрес кошелька изменился',409);
  const [[pending]]=await c.execute("SELECT id FROM tron_swaps WHERE user_id=? AND status IN ('active','review') LIMIT 1 FOR UPDATE",[userId]);
  const [[withdrawal]]=await c.execute("SELECT id FROM crypto_withdrawals WHERE user_id=? AND network='TRON' AND status IN ('prepared','broadcast') LIMIT 1 FOR UPDATE",[userId]);
  if(pending||withdrawal)fail('Дождитесь завершения предыдущей операции TRON',409);
  const steps=[];
  if(job.input_currency==='USDT'){
   const approved=new Decimal(await allowance(pair.address));
   if(approved.lt(units(job.input_amount))){if(approved.gt(0))steps.push('reset');steps.push('approve');}
  }
  steps.push('swap');
  // Each transaction can also burn bandwidth. Reserve 2 TRX per step on top of the energy budget.
  const reserve=new Decimal(policy.fee_budget_trx).plus(steps.length*2).toFixed(6);
  const trxRequired=new Decimal(reserve).plus(job.input_currency==='TRX'?job.input_amount:0);
  if(new Decimal(pair.trx.balance).minus(pair.trx.locked_balance).lt(trxRequired)||job.input_currency==='USDT'&&new Decimal(pair.usdt.balance).minus(pair.usdt.locked_balance).lt(job.input_amount))fail('Недостаточно доступного баланса для свапа и TRX-комиссий',409);
  await c.execute('UPDATE wallets SET locked_balance=locked_balance+? WHERE id=?',[trxRequired.toFixed(6),pair.trx.id]);
  if(job.input_currency==='USDT')await c.execute('UPDATE wallets SET locked_balance=locked_balance+? WHERE id=?',[job.input_amount,pair.usdt.id]);
  await c.execute("UPDATE tron_swaps SET status='active',steps_json=?,reserve_trx=?,fee_limit_sun=? WHERE id=?",[JSON.stringify(steps),reserve,new Decimal(units(policy.fee_budget_trx)).div(steps.length).floor().toFixed(0),id]);
  return {id,status:'active'};
 });
}
export async function settleTronSwap(job,success,output,fee){
 return transact(async c=>{
  const [[current]]=await c.execute('SELECT status FROM tron_swaps WHERE id=? FOR UPDATE',[job.id]);if(current.status!=='active')return;
  const input=new Decimal(job.input_amount),charged=new Decimal(fee);
  if(charged.gt(job.reserve_trx)||charged.lt(0)||success&&new Decimal(output).lt(job.minimum_output))throw new Error('Swap settlement exceeds reservation');
  const trxLock=new Decimal(job.reserve_trx).plus(job.input_currency==='TRX'?input:0);
  const trxDebit=charged.plus(success&&job.input_currency==='TRX'?input:0);
  const trxCredit=success&&job.input_currency==='USDT'?output:'0';
  const [r]=await c.execute("UPDATE wallets SET balance=balance-?+?,locked_balance=locked_balance-? WHERE user_id=? AND currency='TRX' AND balance>=? AND locked_balance>=?",[trxDebit.toFixed(6),trxCredit,trxLock.toFixed(6),job.user_id,trxDebit.toFixed(6),trxLock.toFixed(6)]);
  if(!r.affectedRows)throw new Error('TRX reservation mismatch');
  if(job.input_currency==='USDT'){
   const [u]=await c.execute("UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-? WHERE user_id=? AND currency='USDT' AND balance>=? AND locked_balance>=?",[success?job.input_amount:'0',job.input_amount,job.user_id,success?job.input_amount:'0',job.input_amount]);
   if(!u.affectedRows)throw new Error('USDT reservation mismatch');
  }else if(success)await c.execute("UPDATE wallets SET balance=balance+? WHERE user_id=? AND currency='USDT'",[output,job.user_id]);
  await c.execute('UPDATE tron_swaps SET status=?,fee_charged=?,actual_output=?,error_code=? WHERE id=?',[success?'completed':'failed',charged.toFixed(6),success?output:'0',success?null:'CHAIN_EXECUTION_FAILED',job.id]);
 });
}
export async function runTronSwaps(){
 const c=await db.getConnection();let locked=false;
 try{
  const [[lock]]=await c.query("SELECT GET_LOCK('goblin-tron-swaps',0) AS acquired");locked=Number(lock.acquired)===1;if(!locked)return;
  const [jobs]=await c.query("SELECT * FROM tron_swaps WHERE status='active' ORDER BY created_at LIMIT 20");
  for(const job of jobs){try{
   const steps=parse(job.steps_json),index=Number(job.step_index);
   const [[saved]]=await c.execute('SELECT * FROM tron_swap_transactions WHERE swap_id=? AND step_index=?',[job.id,index]);
   if(!saved){
    if(!tronSwapReady())continue;
    const [[wallet]]=await c.execute("SELECT private_key FROM wallets WHERE user_id=? AND currency='TRX'",[job.user_id]);
    const key=decryptWalletPrivateKey(wallet.private_key,job.user_id,'TRX').replace(/^0x/,'');
    let signed;
    try{signed=await prepareSwapStep(job,steps[index],key);}catch{await settleTronSwap(job,false,'0',job.fee_charged);continue;}
    await c.execute('INSERT INTO tron_swap_transactions(swap_id,step_index,tx_hash,signed_json) VALUES(?,?,?,?)',[job.id,index,signed.txID,JSON.stringify(signed)]);
    try{await broadcastTronTransaction(signed);}catch{/* Durable bytes are reconciled on the next cycle. */}
    continue;
   }
   const receipt=await getSolidTronReceipt(saved.tx_hash);
   if(!receipt?.id){
    const signed=parse(saved.signed_json);
    if(Date.now()>Number(signed.raw_data.expiration)+300000){await c.execute("UPDATE tron_swaps SET status='review',error_code='BROADCAST_UNRESOLVED' WHERE id=?",[job.id]);continue;}
    try{await broadcastTronTransaction(signed);}catch{/* Keep all reservations. */}continue;
   }
   const fee=new Decimal(job.fee_charged).plus(native(receipt.fee||0));
   if(fee.gt(job.reserve_trx))throw new Error('Fee budget exceeded');
   const result=receipt.receipt?.result||receipt.result;
   if(!result)throw new Error('Missing smart contract execution result');
   if(result&&result!=='SUCCESS'){await settleTronSwap(job,false,'0',fee.toFixed(6));continue;}
   if(steps[index]==='swap'){
    const output=native(swapReceiptOutput(receipt,job));
    await settleTronSwap(job,true,output,fee.toFixed(6));
   }else{
    await transact(async tx=>{await tx.execute('SELECT status FROM tron_swaps WHERE id=? FOR UPDATE',[job.id]);await tx.execute('UPDATE tron_swap_transactions SET receipt_json=? WHERE swap_id=? AND step_index=?',[JSON.stringify(receipt),job.id,index]);await tx.execute('UPDATE tron_swaps SET step_index=step_index+1,fee_charged=? WHERE id=? AND step_index=?',[fee.toFixed(6),job.id,index]);});
   }
  }catch{await c.execute("UPDATE tron_swaps SET status='review',error_code='RECEIPT_REVIEW_REQUIRED' WHERE id=?",[job.id]);}}
 }finally{if(locked)await c.query("SELECT RELEASE_LOCK('goblin-tron-swaps')");c.release();}
}
export function startTronSwaps(){const run=()=>runTronSwaps().catch(()=>console.error('TRON swap processing deferred'));run();const timer=setInterval(run,15000);timer.unref?.();return timer;}
