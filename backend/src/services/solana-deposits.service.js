import {PublicKey} from '@solana/web3.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';
import {connection,solanaConfigured,safeAtomic,NATIVE_SOL} from './solana-client.js';
import {recordPendingDeposit} from './deposit-compliance.service.js';
import {reconcileSolanaSwaps} from './solana-custody.service.js';
import {reconcileLaunches} from './pump-launch.service.js';
import Decimal from 'decimal.js';
let running=false;
export async function scanSolanaDeposits(){
 if(!solanaConfigured()||running)return;running=true;
 try{
  const rpc=connection();
  // Fail closed on the wrong cluster rather than recognizing devnet SOL as real money.
  const expected=process.env.SOLANA_EXPECTED_GENESIS||'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(await rpc.getGenesisHash()!==expected)throw new Error('Solana cluster mismatch');
  await reconcileSolanaSwaps();
  await reconcileLaunches();
  const [accounts]=await db.query('SELECT a.*,w.id AS wallet_id FROM solana_accounts a JOIN wallets w ON w.user_id=a.user_id AND w.currency=\'SOL\' ORDER BY a.user_id');
  for(const account of accounts){
   try{
    const signatures=[];let before,complete=false;
    for(let page=0;page<20;page++){
     const batch=await rpc.getSignaturesForAddress(new PublicKey(account.address),{before,until:account.last_signature||undefined,limit:100},'finalized');
     signatures.push(...batch);if(batch.length<100){complete=true;break;}before=batch.at(-1).signature;
    }
    if(!complete)continue; // Never skip an unprocessed page.
    for(const info of signatures.reverse()){
     if(!info.err){
      const tx=await rpc.getParsedTransaction(info.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
      if(!tx?.meta)throw new Error('Receipt unavailable');
      // Outgoing operations are settled by their own durable operation ledger.
      const ownSigner=tx.transaction.message.accountKeys.some(k=>k.pubkey.toBase58()===account.address&&k.signer);
      if(!ownSigner&&!tx.meta.err){
       const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(i=>i.instructions)];
       for(let index=0;index<instructions.length;index++){
        const ix=instructions[index],transfer=ix.parsed?.info;
        if(ix.program!=='system'||ix.parsed?.type!=='transfer'||transfer?.destination!==account.address)continue;
        const value=safeAtomic(transfer.lamports);if(value<=0n)continue;
        await recordPendingDeposit({wallet:{id:account.wallet_id},currency:'SOL',network:'SOLANA',txHash:info.signature,eventIndex:index,from:transfer.source,to:account.address,amount:new Decimal(value.toString()).div(1e9).toFixed(9),timestamp:(tx.blockTime||info.blockTime)*1000});
       }
       // Track received SPL tokens by immutable mint, never by an untrusted ticker.
       const mints=[...new Set((tx.meta.postTokenBalances||[]).filter(t=>t.owner===account.address).map(t=>t.mint))];
       for(const mint of mints){
        if(mint===NATIVE_SOL)continue;
        const post=(tx.meta.postTokenBalances||[]).filter(t=>t.owner===account.address&&t.mint===mint);
        const pre=(tx.meta.preTokenBalances||[]).filter(t=>t.owner===account.address&&t.mint===mint);
        const delta=post.reduce((s,t)=>s+BigInt(t.uiTokenAmount.amount),0n)-pre.reduce((s,t)=>s+BigInt(t.uiTokenAmount.amount),0n);
        if(delta<=0n)continue;
        const decimals=post[0].uiTokenAmount.decimals;
        if(decimals>18)continue;
        // Unsolicited token receipts are recorded for review, not silently spendable.
        await db.execute("INSERT IGNORE INTO solana_receipts(signature,event_index,user_id,mint,amount_atomic,status) VALUES(?,0,?,?,?,'review')",[info.signature,account.user_id,mint,delta.toString()]);
       }
      }
     }
     await db.execute('UPDATE solana_accounts SET last_signature=? WHERE user_id=?',[info.signature,account.user_id]);
    }
   }catch{console.error(`Solana deposit scan deferred for account ${account.user_id}`);}
  }
 }finally{running=false;}
}
export function startSolanaEngine(){const run=()=>scanSolanaDeposits().catch(()=>console.error('Solana processing deferred'));run();const timer=setInterval(run,20000);timer.unref?.();return timer;}
