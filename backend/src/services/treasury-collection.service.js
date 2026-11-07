import {Wallet} from 'ethers';
import {Keypair} from '@solana/web3.js';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {createTronWeb} from './tron.service.js';
import {encryptWalletPrivateKey} from './wallet-generator.service.js';
import {collectionReady} from './collection-engine.service.js';
import {connection} from './solana-client.js';
import {PublicKey} from '@solana/web3.js';
export function collectionPolicy(input){
 if(!['manual','threshold'].includes(input.mode))throw Object.assign(new Error('Выберите ручной режим или режим по порогу'),{status:400});
 let threshold;try{threshold=new Decimal(String(input.threshold));}catch{threshold=new Decimal(NaN);}
 if(!threshold.isFinite()||threshold.lte(0)||threshold.gt('1000000000')||threshold.decimalPlaces()>9)throw Object.assign(new Error('Порог должен быть положительным, не более 9 знаков после запятой'),{status:400});
 return {mode:input.mode,threshold:threshold.toFixed(9)};
}
export async function collectionOverview(){
 const [rows]=await db.query(`SELECT p.network,p.mode,CAST(p.threshold_amount AS CHAR) AS threshold,
 p.minimum_source_amount,p.maximum_network_fee,w.currency,w.address,w.created_at FROM treasury_collection_policy p
 LEFT JOIN treasury_collection_wallets w ON w.network=p.network ORDER BY p.network`);
 const [treasury]=await db.query('SELECT currency,CAST(balance AS CHAR) AS balance FROM admin_treasury');
 const [jobs]=await db.query('SELECT id,network,source_address,destination_address,amount,received,fee_charged,status,tx_hash,error_code,created_at FROM treasury_collection_jobs ORDER BY created_at DESC LIMIT 100');
 const [grants]=await db.query('SELECT job_id,amount,status,tx_hash,fee_charged FROM treasury_collection_gas_grants ORDER BY created_at DESC LIMIT 100');
 const networks=await Promise.all(rows.map(async r=>{let gasBalance=null;try{if(r.address)gasBalance=r.network==='TRON'?new Decimal(String(await createTronWeb().trx.getBalance(r.address))).div(1e6).toFixed(6):new Decimal(String(await connection().getBalance(new PublicKey(r.address),'finalized'))).div(1e9).toFixed(9);}catch{/* Do not substitute zero for unavailable chain data. */}return {...r,ready:collectionReady(r.network),gasBalance,currency:r.currency||(r.network==='TRON'?'USDT':'SOL'),treasuryBalance:treasury.find(t=>t.currency===(r.network==='TRON'?'USDT':'SOL'))?.balance||'0'};}));
 return {networks,jobs,grants,executionAvailable:networks.some(n=>n.ready),reason:'Сбор работает только для полностью сверенных источников комиссии. Неадресуемые P2P/гарант и история внутренних переводов требуют проверки и пропускаются. Клиентские и AML-остатки не используются.'};
}
export async function createCollectionWallets(actorId){
 await transact(async c=>{
  await c.query('SELECT network FROM treasury_collection_policy ORDER BY network FOR UPDATE');
  for(const network of ['TRON','SOLANA']){
   const [[old]]=await c.execute('SELECT address FROM treasury_collection_wallets WHERE network=?',[network]);if(old)continue;
   let address,secret;
   if(network==='TRON'){secret=Wallet.createRandom().privateKey.slice(2);address=createTronWeb().address.fromPrivateKey(secret);}
   else{const key=Keypair.generate();address=key.publicKey.toBase58();secret=Buffer.from(key.secretKey).toString('base64');}
   if(!address)throw new Error('Collection wallet generation failed');
   const encrypted=encryptWalletPrivateKey(secret,0,`TREASURY:${network}`);
   await c.execute('INSERT INTO treasury_collection_wallets(network,currency,address,encrypted_key,created_by) VALUES(?,?,?,?,?)',[network,network==='TRON'?'USDT':'SOL',address,encrypted,actorId]);
   await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'WALLET_CREATED',?)",[actorId,network,JSON.stringify({address})]);
  }
 });return collectionOverview();
}
export async function saveCollectionPolicy(actorId,network,input){
 if(!['TRON','SOLANA'].includes(network))throw Object.assign(new Error('Неизвестная сеть'),{status:400});
 const policy=collectionPolicy(input);
 const [[old]]=await db.execute('SELECT * FROM treasury_collection_policy WHERE network=?',[network]);
 for(const [key,value] of [['minimum_source_amount',input.minimumSource??old.minimum_source_amount],['maximum_network_fee',input.maximumFee??old.maximum_network_fee]]){
  let n;try{n=new Decimal(String(value));}catch{n=new Decimal(NaN);}
  if(!n.isFinite()||n.lte(0)||n.gt(key==='maximum_network_fee'?(network==='TRON'?1000:1):1000000000)||n.decimalPlaces()>(network==='TRON'?6:9))throw Object.assign(new Error('Проверьте минимум на адресе и лимит расходов сети'),{status:400});policy[key]=n.toFixed(network==='TRON'?6:9);
 }
 await transact(async c=>{
  await c.execute('SELECT network FROM treasury_collection_policy WHERE network=? FOR UPDATE',[network]);
  await c.execute('UPDATE treasury_collection_policy SET mode=?,threshold_amount=?,minimum_source_amount=?,maximum_network_fee=?,updated_by=? WHERE network=?',[policy.mode,policy.threshold,policy.minimum_source_amount,policy.maximum_network_fee,actorId,network]);
  await c.execute("INSERT INTO treasury_collection_audit(actor_id,network,action,details_json) VALUES(?,?,'POLICY_SAVED',?)",[actorId,network,JSON.stringify(policy)]);
 });return collectionOverview();
}
