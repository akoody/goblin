import {Connection,PublicKey,Keypair,VersionedTransaction} from '@solana/web3.js';
import Decimal from 'decimal.js';
const TOKEN_PROGRAM_ID=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID=new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const NATIVE_SOL='So11111111111111111111111111111111111111112';
export const solanaConfigured=()=>Boolean(process.env.SOLANA_RPC_URL);
export const swapConfigured=()=>solanaConfigured()&&Boolean(process.env.JUPITER_API_KEY)&&process.env.SOLANA_SWAP_SIGNING_ENABLED==='true';
export const connection=()=>new Connection(process.env.SOLANA_RPC_URL,{commitment:'finalized',confirmTransactionInitialTimeout:15000,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'})});
export function atomicSol(value){
 let n;try{n=new Decimal(String(value));}catch{throw new Error('Некорректная сумма SOL');}
 if(!n.isFinite()||n.lte(0)||n.decimalPlaces()>9||n.gt(1000000))throw new Error('Сумма SOL должна быть положительной, максимум 9 знаков после запятой');
 return n.mul(1e9).toFixed(0);
}
export function safeAtomic(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('Unsafe RPC integer');return BigInt(value);}
export async function mintInfo(mint){
 const key=new PublicKey(mint),rpc=connection(),info=await rpc.getAccountInfo(key,'finalized');
 if(!info||(!info.owner.equals(TOKEN_PROGRAM_ID)&&!info.owner.equals(TOKEN_2022_PROGRAM_ID)))throw new Error('Адрес не является mint токена Solana');
 // Token-2022 extensions can change transfer semantics. Reject until explicitly supported.
 if(info.owner.equals(TOKEN_2022_PROGRAM_ID))throw new Error('Токены Token-2022 пока не поддерживаются');
 if(info.data.length!==82||info.data[45]!==1||info.data[44]>18||info.data.readUInt32LE(46)!==0)throw new Error('Токен не поддерживается: проверьте decimals и право заморозки');
 return {mint:key.toBase58(),decimals:info.data[44],program:info.owner.toBase58()};
}
export function tokenBalance(raw,mint,owner){
 return (raw||[]).filter(t=>t.mint===mint&&t.owner===owner).reduce((sum,t)=>sum+BigInt(t.uiTokenAmount.amount),0n);
}
export async function jupiterOrder(address,mint,amount,slippage){
 const query=new URLSearchParams({inputMint:NATIVE_SOL,outputMint:mint,amount,taker:address,slippageBps:String(slippage),excludeRouters:'jupiterz,dflow,okx',maxSupportedTransactionVersion:'0',priorityFeeLamports:'100000',broadcastFeeType:'maxCap'});
 const r=await fetch(`https://api.jup.ag/swap/v2/order?${query}`,{headers:{'x-api-key':process.env.JUPITER_API_KEY},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw new Error('Маршрут обмена сейчас недоступен');
 const q=await r.json();
 if(q.error||q.errorCode||!q.transaction||q.router!=='metis'||q.inputMint!==NATIVE_SOL||q.outputMint!==mint||q.inAmount!==amount||q.taker!==address||!/^\d+$/.test(q.otherAmountThreshold||'')||BigInt(q.otherAmountThreshold)<=0n||Number(q.slippageBps)>slippage||!q.requestId||!/^\d+$/.test(String(q.lastValidBlockHeight)))throw new Error('Провайдер не вернул допустимый маршрут');
 return q;
}
export async function validateAndSign(quote,secret,address,mint,decimals,maxCost){
 const rpc=connection(),keypair=Keypair.fromSecretKey(Buffer.from(secret,'base64'));
 if(await rpc.getGenesisHash()!==(process.env.SOLANA_EXPECTED_GENESIS||'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'))throw new Error('Solana cluster mismatch');
 if(keypair.publicKey.toBase58()!==address)throw new Error('Signer address mismatch');
 const tx=VersionedTransaction.deserialize(Buffer.from(quote.transaction,'base64'));
 if(tx.message.header.numRequiredSignatures!==1||tx.message.staticAccountKeys[0].toBase58()!==address)throw new Error('Unexpected swap signer');
 const tables=await Promise.all(tx.message.addressTableLookups.map(async l=>{const r=await rpc.getAddressLookupTable(l.accountKey);if(!r.value)throw new Error('Missing lookup table');return r.value;}));
 const keys=tx.message.getAccountKeys({addressLookupTableAccounts:tables});
 const writable=[];
 for(let i=0;i<keys.length;i++)if(tx.message.isAccountWritable(i))writable.push(keys.get(i));
 const existing=await rpc.getMultipleAccountsInfo(writable,'finalized');
 for(const account of existing){
  if(!account||!account.owner.equals(TOKEN_PROGRAM_ID)||account.data.length<165)continue;
  const owner=new PublicKey(account.data.subarray(32,64)).toBase58(),asset=new PublicKey(account.data.subarray(0,32)).toBase58();
  if(owner===address&&asset!==mint&&asset!==NATIVE_SOL)throw new Error('Swap touches unrelated customer token');
 }
 // Only the router and standard setup/cleanup programs may execute at top level.
 const allowed=new Set(['11111111111111111111111111111111','ComputeBudget111111111111111111111111111111','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',TOKEN_PROGRAM_ID.toBase58(),'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4']);
 for(const ix of tx.message.compiledInstructions){
  const program=keys.get(ix.programIdIndex).toBase58();
  if(!allowed.has(program))throw new Error('Unsupported swap program');
  if(program===TOKEN_PROGRAM_ID.toBase58()&&[4,6,13].includes(ix.data[0]))throw new Error('Token authority changes forbidden');
 }
 const [ata]=PublicKey.findProgramAddressSync([keypair.publicKey.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),new PublicKey(mint).toBuffer()],ASSOCIATED_TOKEN_PROGRAM);
 const before=await rpc.getMultipleAccountsInfo([keypair.publicKey,ata],'finalized');
 const simulated=await rpc.simulateTransaction(tx,{sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',accounts:{encoding:'base64',addresses:[address,ata.toBase58()]}});
 if(simulated.value.err)throw new Error('Симуляция обмена отклонена');
 const after=simulated.value.accounts;
 if(!after?.[0]||!after[1]||after[0].owner!=='11111111111111111111111111111111'||after[1].owner!==TOKEN_PROGRAM_ID.toBase58())throw new Error('Invalid simulated accounts');
 const preSol=safeAtomic(before[0]?.lamports||0),postSol=safeAtomic(after[0].lamports);
 const data=Buffer.from(after[1].data[0],'base64'),old=before[1]?.data;
 if(data.length<165||!data.subarray(0,32).equals(new PublicKey(mint).toBuffer())||!data.subarray(32,64).equals(keypair.publicKey.toBuffer())||data.readUInt32LE(72)!==0||data.readUInt32LE(129)!==0)throw new Error('Invalid output token account');
 const output=data.readBigUInt64LE(64)-(old?old.readBigUInt64LE(64):0n);
 if(output<BigInt(quote.otherAmountThreshold)||preSol-postSol>BigInt(maxCost)||preSol-postSol<BigInt(quote.inAmount))throw new Error('Swap simulation exceeds approved amounts');
 tx.sign([keypair]);return {signed:Buffer.from(tx.serialize()).toString('base64'),signature:Buffer.from(tx.signatures[0])};
}
