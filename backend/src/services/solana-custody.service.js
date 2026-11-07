import {randomUUID} from 'node:crypto';
import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {encryptWalletPrivateKey,decryptWalletPrivateKey} from './wallet-generator.service.js';
import {connection,solanaConfigured,swapConfigured,atomicSol,safeAtomic,mintInfo,jupiterOrder,validateAndSign,tokenBalance,NATIVE_SOL} from './solana-client.js';
import {assertAccountFeature} from '../middleware/account-feature.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const units=n=>new Decimal(String(n)).div(1e9).toFixed(9);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function solanaAccount(userId){
 return transact(async c=>{
  await c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
  const [[old]]=await c.execute('SELECT * FROM solana_accounts WHERE user_id=?',[userId]);
  if(old)return old;
  const keypair=Keypair.generate(),address=keypair.publicKey.toBase58();
  const encrypted=encryptWalletPrivateKey(Buffer.from(keypair.secretKey).toString('base64'),userId,'SOL');
  await c.execute('INSERT INTO solana_accounts(user_id,address,encrypted_key) VALUES(?,?,?)',[userId,address,encrypted]);
  await c.execute("INSERT INTO wallets(user_id,currency,balance,address,private_key) VALUES(?,'SOL',0,?,?) ON DUPLICATE KEY UPDATE address=VALUES(address),private_key=VALUES(private_key)",[userId,address,encrypted]);
  return {user_id:userId,address,encrypted_key:encrypted};
 });
}
export async function solanaState(userId){
 const account=await solanaAccount(userId);
 const [[wallet]]=await db.execute("SELECT balance,locked_balance FROM wallets WHERE user_id=? AND currency='SOL'",[userId]);
 const [tokens]=await db.execute('SELECT mint,decimals,amount_atomic FROM solana_holdings WHERE user_id=?',[userId]);
 const [swaps]=await db.execute('SELECT id,mint,input_atomic,output_atomic,cost_atomic,status,signature,error_code,created_at FROM solana_swaps WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[userId]);
 const [[policy]]=await db.query('SELECT enabled,minimum_sol,max_fee_sol FROM solana_swap_policy WHERE id=1');
 return {address:account.address,wallet,tokens,swaps,policy,depositReady:solanaConfigured(),swapReady:swapConfigured()&&Boolean(policy.enabled)};
}
export async function createSolanaQuote(userId,body){
 await assertAccountFeature(userId,'trading');
 const [[policy]]=await db.query('SELECT * FROM solana_swap_policy WHERE id=1');
 if(!policy.enabled||!swapConfigured())fail('Свап Solana ещё не включён администратором',503);
 const input=atomicSol(body.amount);
 if(new Decimal(body.amount).lt(policy.minimum_sol))fail(`Минимум для свапа: ${policy.minimum_sol} SOL`);
 const slippage=Number(body.slippageBps??100);
 if(!Number.isInteger(slippage)||slippage<10||slippage>300)fail('Допустимое проскальзывание: от 0,1% до 3%');
 const mint=await mintInfo(String(body.mint||''));
 if(mint.mint===NATIVE_SOL)fail('Выберите SPL-токен вместо SOL');
 const account=await solanaAccount(userId),quote=await jupiterOrder(account.address,mint.mint,input,slippage);
 const reserve=(BigInt(input)+BigInt(atomicSol(policy.max_fee_sol))).toString();
 const key=String(body.requestKey||'');if(!/^[\w-]{16,128}$/.test(key))fail('Некорректный ключ запроса');
 const id=randomUUID();
 const [insert]=await db.execute(`INSERT IGNORE INTO solana_swaps(id,user_id,request_key,mint,decimals,input_atomic,reserve_atomic,minimum_output,quote_json,expires_at)
 VALUES(?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 40 SECOND))`,[id,userId,key,mint.mint,mint.decimals,input,reserve,quote.otherAmountThreshold,JSON.stringify(quote)]);
 if(!insert.affectedRows)fail('Запрос уже использован. Обновите котировку.',409);
 return {id,mint:mint.mint,decimals:mint.decimals,input:units(input),output:new Decimal(quote.outAmount).div(new Decimal(10).pow(mint.decimals)).toFixed(),minimumOutput:new Decimal(quote.otherAmountThreshold).div(new Decimal(10).pow(mint.decimals)).toFixed(),maxNetworkCost:policy.max_fee_sol,expiresIn:40};
}
export async function executeSolanaSwap(userId,id){
 await assertAccountFeature(userId,'trading');
 if(!swapConfigured())fail('Серверная отправка Solana отключена',503);
 const account=await solanaAccount(userId),c=await db.getConnection();let locked=false;
 try{
  const [[lock]]=await c.query('SELECT GET_LOCK(?,0) AS acquired',[`solana-user-${userId}`]);locked=Number(lock.acquired)===1;
  if(!locked)fail('Для кошелька уже выполняется операция',409);
  const [[job]]=await c.execute('SELECT *,expires_at>NOW() AS fresh FROM solana_swaps WHERE id=? AND user_id=?',[id,userId]);
  if(!job)fail('Котировка не найдена',404);
  if(job.status!=='quoted')return {id,status:job.status,signature:job.signature};
  if(!job.fresh)fail('Котировка истекла. Запросите новую.',409);
  const [[pending]]=await c.execute("SELECT id FROM solana_swaps WHERE user_id=? AND status IN ('prepared','submitted','review') UNION ALL SELECT id FROM pump_launches WHERE user_id=? AND status IN ('prepared','submitted','review') LIMIT 1",[userId,userId]);
  if(pending)fail('Предыдущий обмен ещё не подтверждён',409);
  const [[policy]]=await c.query('SELECT * FROM solana_swap_policy WHERE id=1');
  if(!policy.enabled||new Decimal(units(job.input_atomic)).lt(policy.minimum_sol))fail('Параметры свапа изменились. Обновите котировку.',409);
  if(BigInt(job.reserve_atomic)>BigInt(job.input_atomic)+BigInt(atomicSol(policy.max_fee_sol)))fail('Резерв комиссии изменился. Обновите котировку.',409);
  const currentMint=await mintInfo(job.mint);
  if(Number(currentMint.decimals)!==Number(job.decimals))fail('Параметры токена изменились',409);
  const secret=decryptWalletPrivateKey(account.encrypted_key,userId,'SOL');
  const signed=await validateAndSign(parse(job.quote_json),secret,account.address,job.mint,job.decimals,job.reserve_atomic);
  const signature=bs58.encode(signed.signature);
  await transact(async tx=>{
   const [[user]]=await tx.execute('SELECT status FROM users WHERE id=? FOR UPDATE',[userId]);if(user?.status!=='active')fail('Аккаунт недоступен',403);
   const [[row]]=await tx.execute('SELECT status,expires_at>NOW() AS fresh FROM solana_swaps WHERE id=? FOR UPDATE',[id]);
   if(row.status!=='quoted'||!row.fresh)fail('Котировка уже использована или истекла',409);
   const [reserved]=await tx.execute("UPDATE wallets SET locked_balance=locked_balance+? WHERE user_id=? AND currency='SOL' AND balance-locked_balance>=?",[units(job.reserve_atomic),userId,units(job.reserve_atomic)]);
   if(!reserved.affectedRows)fail('Недостаточно доступного SOL с учётом сетевых расходов',409);
   await tx.execute("UPDATE solana_swaps SET status='prepared',signature=?,signed_transaction=? WHERE id=?",[signature,signed.signed,id]);
  });
  // The signature and reservation exist durably before any broadcast. On timeout reconcile, never create a new transaction.
  try{await connection().sendRawTransaction(Buffer.from(signed.signed,'base64'),{skipPreflight:false,maxRetries:2});await c.execute("UPDATE solana_swaps SET status='submitted' WHERE id=? AND status='prepared'",[id]);}
  catch{await c.execute("UPDATE solana_swaps SET error_code='BROADCAST_UNCERTAIN' WHERE id=?",[id]);}
  return {id,status:'submitted',signature};
 }finally{if(locked)await c.query('SELECT RELEASE_LOCK(?)',[`solana-user-${userId}`]);c.release();}
}
export async function reconcileSolanaSwaps(){
 const [jobs]=await db.query("SELECT s.*,a.address FROM solana_swaps s JOIN solana_accounts a ON a.user_id=s.user_id WHERE s.status IN ('prepared','submitted') ORDER BY s.created_at LIMIT 30");
 const rpc=connection();
 for(const job of jobs){
  try{
   const tx=await rpc.getParsedTransaction(job.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
   if(!tx){
    const status=(await rpc.getSignatureStatuses([job.signature],{searchTransactionHistory:true})).value[0];
    const quote=parse(job.quote_json);
    const blockhash=VersionedTransaction.deserialize(Buffer.from(job.signed_transaction,'base64')).message.recentBlockhash;
    if(!status&&await rpc.getBlockHeight('finalized')>Number(quote.lastValidBlockHeight)+150&&!(await rpc.isBlockhashValid(blockhash,{commitment:'finalized'})).value){
     await settleSwap(job,0n,0n,'expired');
    }else if(!status)try{await rpc.sendRawTransaction(Buffer.from(job.signed_transaction,'base64'),{skipPreflight:false,maxRetries:1});}catch{/* Keep reservation until finality/expiry. */}
    continue;
   }
   const index=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===job.address);
   if(index<0||!tx.meta)throw new Error('Invalid swap receipt');
   const cost=safeAtomic(tx.meta.preBalances[index])-safeAtomic(tx.meta.postBalances[index]);
   const output=tokenBalance(tx.meta.postTokenBalances,job.mint,job.address)-tokenBalance(tx.meta.preTokenBalances,job.mint,job.address);
   if(cost<0n||cost>BigInt(job.reserve_atomic)||(!tx.meta.err&&output<BigInt(job.minimum_output))){await db.execute("UPDATE solana_swaps SET status='review',error_code='RECEIPT_MISMATCH' WHERE id=?",[job.id]);continue;}
   await settleSwap(job,cost,tx.meta.err?0n:output,tx.meta.err?'failed':'completed');
  }catch{await db.execute("UPDATE solana_swaps SET error_code='RECONCILIATION_RETRY' WHERE id=?",[job.id]);}
 }
}
export async function settleSwap(job,cost,output,status){
 await transact(async c=>{
  const [[current]]=await c.execute('SELECT status FROM solana_swaps WHERE id=? FOR UPDATE',[job.id]);
  if(!['prepared','submitted'].includes(current.status))return;
  const [changed]=await c.execute("UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-? WHERE user_id=? AND currency='SOL' AND balance>=? AND locked_balance>=?",[units(cost),units(job.reserve_atomic),job.user_id,units(cost),units(job.reserve_atomic)]);
  if(!changed.affectedRows)throw new Error('Swap ledger reservation mismatch');
  if(output>0n)await c.execute('INSERT INTO solana_holdings(user_id,mint,decimals,amount_atomic) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE amount_atomic=amount_atomic+VALUES(amount_atomic)',[job.user_id,job.mint,job.decimals,output.toString()]);
  await c.execute('UPDATE solana_swaps SET status=?,output_atomic=?,cost_atomic=?,error_code=NULL,signed_transaction=NULL WHERE id=?',[status,output.toString(),cost.toString(),job.id]);
 });
}
