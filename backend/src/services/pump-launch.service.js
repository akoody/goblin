import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {solanaAccount} from './solana-custody.service.js';
import {connection,swapConfigured,safeAtomic,tokenBalance,NATIVE_SOL} from './solana-client.js';
import {encryptWalletPrivateKey,decryptWalletPrivateKey} from './wallet-generator.service.js';
import {assertAccountFeature} from '../middleware/account-feature.js';
import {launchInput,solUnits} from './pump-launch-validation.js';
// The SDK's ESM distribution imports named CJS exports. Use its supported CJS build.
const require=createRequire(import.meta.url);
const {PUMP_SDK,OnlinePumpSdk,getBuyTokenAmountFromSolAmount,newBondingCurve}=require('@pump-fun/pump-sdk');
const BN=require('bn.js');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export async function launchInstructions({global,mint,user,name,symbol,uri,minimum,buy}){
 const create=await PUMP_SDK.createV2Instruction({mint,user,creator:user,name,symbol,uri,mayhemMode:false,holderReward:false});
 const purchase=await PUMP_SDK.buyExactQuoteInV3Instructions({bondingCurve:newBondingCurve(global),associatedUserAccountInfo:null,mint,user,amount:new BN(minimum),quoteAmount:new BN(buy),slippage:0,tokenProgram:new PublicKey(TOKEN_2022)});
 return [create,...purchase];
}
export async function pumpState(userId){
 const account=await solanaAccount(userId);
 const [[policy]]=await db.query('SELECT * FROM pump_policy WHERE id=1');
 const [launches]=await db.execute('SELECT id,name,symbol,mint,status,signature,buy_atomic,service_fee_atomic,output_atomic,cost_atomic,error_code,created_at FROM pump_launches WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[userId]);
 return {address:account.address,policy,ready:swapConfigured()&&Boolean(policy.enabled),launches};
}
export async function draftLaunch(userId,body){
 await assertAccountFeature(userId,'trading');
 const [[policy]]=await db.query('SELECT * FROM pump_policy WHERE id=1');
 if(!policy.enabled||!swapConfigured())fail('Создание мемкоинов пока выключено',503);
 let input;try{input=launchInput(body,policy);}catch(e){fail(e.message);}
 const request=String(body.requestKey||'');if(!/^[\w-]{16,128}$/.test(request))fail('Некорректный ключ запроса');
 const mint=Keypair.generate(),id=randomUUID();
 const metadata={name:input.name,symbol:input.symbol,description:input.description,image:`https://cryptogoblin.ru/api/pump/image/${id}`,...input.links};
 await solanaAccount(userId);
 const encrypted=encryptWalletPrivateKey(Buffer.from(mint.secretKey).toString('base64'),userId,`PUMP:${id}`);
 await db.execute(`INSERT INTO pump_launches(id,user_id,request_key,mint,encrypted_mint_key,name,symbol,metadata_json,image_data,buy_atomic,service_fee_atomic,network_budget_atomic,reserve_atomic,expires_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))`,[id,userId,request,mint.publicKey.toBase58(),encrypted,input.name,input.symbol,JSON.stringify(metadata),input.image,input.buy,input.fee,input.budget,input.reserve]);
 return {id,mint:mint.publicKey.toBase58(),buySol:solUnits(input.buy),serviceFeeSol:solUnits(input.fee),networkBudgetSol:solUnits(input.budget),maximumSol:solUnits(input.reserve)};
}
async function buildLaunch(job,account){
 const rpc=connection();if(await rpc.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')fail('Неверная сеть Solana',503);
 const user=Keypair.fromSecretKey(Buffer.from(decryptWalletPrivateKey(account.encrypted_key,job.user_id,'SOL'),'base64'));
 const mint=Keypair.fromSecretKey(Buffer.from(decryptWalletPrivateKey(job.encrypted_mint_key,job.user_id,`PUMP:${job.id}`),'base64'));
 if(user.publicKey.toBase58()!==account.address||mint.publicKey.toBase58()!==job.mint)throw new Error('Launch signer mismatch');
 const online=new OnlinePumpSdk(rpc),global=await online.fetchGlobal(),feeConfig=await online.fetchFeeConfig();
 const expected=getBuyTokenAmountFromSolAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:new BN(job.buy_atomic),quoteMint:new PublicKey(NATIVE_SOL)});
 // One atomic transaction: create and first purchase either both succeed or both roll back.
 const minimum=expected.muln(99).divn(100);if(minimum.lten(0))fail('Сумма первой покупки слишком мала');
 const instructions=await launchInstructions({global,mint:mint.publicKey,name:job.name,symbol:job.symbol,uri:`https://cryptogoblin.ru/api/pump/m/${job.id}`,user:user.publicKey,minimum:minimum.toString(),buy:job.buy_atomic});
 const latest=await rpc.getLatestBlockhash('finalized');
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:user.publicKey,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...instructions]}).compileToV0Message());
 if(tx.serialize().length>1232)fail('Название и тикер не помещаются в транзакцию. Сократите их.',409);
 const [ata]=PublicKey.findProgramAddressSync([user.publicKey.toBuffer(),new PublicKey(TOKEN_2022).toBuffer(),mint.publicKey.toBuffer()],new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'));
 const balance=safeAtomic(await rpc.getBalance(user.publicKey,'finalized'));
 if(balance<BigInt(job.buy_atomic)+BigInt(job.network_budget_atomic))fail('На адресе недостаточно SOL для покупки и сетевых расходов',409);
 const simulated=await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'finalized',accounts:{encoding:'base64',addresses:[account.address,mint.publicKey.toBase58(),ata.toBase58()]}});
 if(simulated.value.err)fail('Симуляция создания отклонена. Средства не отправлены.',409);
 const after=simulated.value.accounts;
 if(!after?.[0]||after[1]?.owner!==TOKEN_2022||after[2]?.owner!==TOKEN_2022)throw new Error('Invalid launch simulation');
 const token=Buffer.from(after[2].data[0],'base64');
 if(token.length<165||!token.subarray(0,32).equals(mint.publicKey.toBuffer())||!token.subarray(32,64).equals(user.publicKey.toBuffer())||token.readBigUInt64LE(64)<BigInt(minimum.toString())||token.readUInt32LE(72)!==0||token.readUInt32LE(129)!==0)throw new Error('Launch token account mismatch');
 const messageFee=await rpc.getFeeForMessage(tx.message,'finalized');if(messageFee.value==null)throw new Error('Fee unavailable');
 const cost=balance-safeAtomic(after[0].lamports)+BigInt(messageFee.value);
 if(cost<0n||cost>BigInt(job.buy_atomic)+BigInt(job.network_budget_atomic))fail('Расходы сети превышают подтверждённый резерв',409);
 tx.sign([user,mint]);return {signed:Buffer.from(tx.serialize()).toString('base64'),signature:bs58.encode(tx.signatures[0]),height:latest.lastValidBlockHeight,minimum:minimum.toString()};
}
export async function executeLaunch(userId,id){
 await assertAccountFeature(userId,'trading');
 const [[access]]=await db.execute('SELECT status,withdrawals_enabled FROM users WHERE id=?',[userId]);
 if(access?.status!=='active'||Number(access.withdrawals_enabled)!==1)fail('Операции кошелька для аккаунта отключены',403);
 if(!swapConfigured())fail('Отправка Solana отключена',503);
 const account=await solanaAccount(userId),c=await db.getConnection();let acquired=false;
 try{
  const [[lock]]=await c.query('SELECT GET_LOCK(?,0) AS ok',[`solana-user-${userId}`]);acquired=Number(lock.ok)===1;if(!acquired)fail('Кошелёк занят',409);
  const [[job]]=await c.execute('SELECT *,expires_at>NOW() AS fresh FROM pump_launches WHERE id=? AND user_id=?',[id,userId]);
  if(!job)fail('Запуск не найден',404);if(job.status!=='draft')return {status:job.status,signature:job.signature};if(!job.fresh)fail('Расчёт истёк. Создайте новый.',409);
  const [[pending]]=await c.execute("SELECT id FROM solana_swaps WHERE user_id=? AND status IN ('prepared','submitted','review') UNION ALL SELECT id FROM pump_launches WHERE user_id=? AND status IN ('prepared','submitted','review') LIMIT 1",[userId,userId]);if(pending)fail('Дождитесь подтверждения предыдущей операции',409);
  const [[policy]]=await c.query('SELECT * FROM pump_policy WHERE id=1');if(!policy.enabled)fail('Запуск выключен',503);
  if(!new Decimal(solUnits(job.service_fee_atomic)).eq(policy.service_fee_sol)||new Decimal(solUnits(job.buy_atomic)).lt(policy.minimum_buy_sol)||!new Decimal(solUnits(job.network_budget_atomic)).eq(policy.network_budget_sol))fail('Настройки изменились. Обновите расчёт.',409);
  const built=await buildLaunch(job,account);
  await transact(async tx=>{
   const [[user]]=await tx.execute('SELECT status,trading_enabled,withdrawals_enabled FROM users WHERE id=? FOR UPDATE',[userId]);if(user?.status!=='active'||Number(user.trading_enabled)!==1||Number(user.withdrawals_enabled)!==1)fail('Операции аккаунта отключены',403);
   const [[row]]=await tx.execute('SELECT status,expires_at>NOW() AS fresh FROM pump_launches WHERE id=? FOR UPDATE',[id]);if(row.status!=='draft'||!row.fresh)fail('Расчёт уже использован или истёк',409);
   const [reserved]=await tx.execute("UPDATE wallets SET locked_balance=locked_balance+? WHERE user_id=? AND currency='SOL' AND balance-locked_balance>=?",[solUnits(job.reserve_atomic),userId,solUnits(job.reserve_atomic)]);if(!reserved.affectedRows)fail('Недостаточно доступного SOL',409);
   await tx.execute("UPDATE pump_launches SET status='prepared',signature=?,signed_transaction=?,minimum_output=?,last_valid_height=?,encrypted_mint_key=NULL WHERE id=?",[built.signature,built.signed,built.minimum,built.height,id]);
  });
  try{await connection().sendRawTransaction(Buffer.from(built.signed,'base64'),{skipPreflight:false,maxRetries:2});await c.execute("UPDATE pump_launches SET status='submitted' WHERE id=? AND status='prepared'",[id]);}catch{await c.execute("UPDATE pump_launches SET error_code='BROADCAST_UNCERTAIN' WHERE id=?",[id]);}
  return {status:'submitted',signature:built.signature};
 }finally{if(acquired)await c.query('SELECT RELEASE_LOCK(?)',[`solana-user-${userId}`]);c.release();}
}
export async function settleLaunch(job,cost,output,status){
 const fee=status==='completed'?BigInt(job.service_fee_atomic):0n,total=cost+fee;
 if(total>BigInt(job.reserve_atomic)||cost<0n||output<0n)throw new Error('Invalid launch cost');
 await transact(async c=>{
  const [[row]]=await c.execute('SELECT status FROM pump_launches WHERE id=? FOR UPDATE',[job.id]);if(!['prepared','submitted'].includes(row.status))return;
  const [changed]=await c.execute("UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-? WHERE user_id=? AND currency='SOL' AND balance>=? AND locked_balance>=?",[solUnits(total),solUnits(job.reserve_atomic),job.user_id,solUnits(total),solUnits(job.reserve_atomic)]);if(!changed.affectedRows)throw new Error('Launch reserve mismatch');
  if(status==='completed'){
   await c.execute('INSERT INTO solana_holdings(user_id,mint,decimals,amount_atomic) VALUES(?,?,6,?) ON DUPLICATE KEY UPDATE amount_atomic=amount_atomic+VALUES(amount_atomic)',[job.user_id,job.mint,output.toString()]);
   await c.execute('INSERT INTO pump_fee_ledger(launch_id,user_id,amount_sol) VALUES(?,?,?)',[job.id,job.user_id,solUnits(fee)]);
   await c.execute("INSERT INTO admin_treasury(currency,balance) VALUES('SOL',?) ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)",[solUnits(fee)]);
  }
  await c.execute('UPDATE pump_launches SET status=?,cost_atomic=?,output_atomic=?,signed_transaction=NULL,error_code=NULL WHERE id=?',[status,cost.toString(),output.toString(),job.id]);
 });
}
export async function reconcileLaunches(){
 const [jobs]=await db.query("SELECT l.*,a.address FROM pump_launches l JOIN solana_accounts a ON a.user_id=l.user_id WHERE l.status IN ('prepared','submitted') LIMIT 30");const rpc=connection();
 for(const job of jobs)try{
  const tx=await rpc.getParsedTransaction(job.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
  if(!tx){const status=(await rpc.getSignatureStatuses([job.signature],{searchTransactionHistory:true})).value[0];const message=VersionedTransaction.deserialize(Buffer.from(job.signed_transaction,'base64')).message;
   if(!status&&await rpc.getBlockHeight('finalized')>Number(job.last_valid_height)+150&&!(await rpc.isBlockhashValid(message.recentBlockhash,{commitment:'finalized'})).value)await settleLaunch(job,0n,0n,'expired');
   else if(!status)try{await rpc.sendRawTransaction(Buffer.from(job.signed_transaction,'base64'),{skipPreflight:false,maxRetries:1});}catch{/* Replay identical bytes only. */}continue;
  }
  const index=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.toBase58()===job.address&&k.signer);if(index<0||!tx.meta)throw new Error('Missing payer');
  const cost=safeAtomic(tx.meta.preBalances[index])-safeAtomic(tx.meta.postBalances[index]);
  const output=tokenBalance(tx.meta.postTokenBalances,job.mint,job.address)-tokenBalance(tx.meta.preTokenBalances,job.mint,job.address);
  if(cost<0n||cost>BigInt(job.buy_atomic)+BigInt(job.network_budget_atomic)||(!tx.meta.err&&output<BigInt(job.minimum_output))){await db.execute("UPDATE pump_launches SET status='review',error_code='RECEIPT_MISMATCH' WHERE id=?",[job.id]);continue;}
  await settleLaunch(job,cost,tx.meta.err?0n:output,tx.meta.err?'failed':'completed');
 }catch{await db.execute("UPDATE pump_launches SET error_code='RECONCILIATION_RETRY' WHERE id=?",[job.id]);}
}
