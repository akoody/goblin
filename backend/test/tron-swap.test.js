import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {swapAmount,minOutput,tronWalletCompatibility,swapReceiptOutput,TRX_WRAPPED} from '../src/services/tron-swap-client.js';
import {settleTronSwap} from '../src/services/tron-swap.service.js';
import {createTronWeb,TRON_USDT_CONTRACT} from '../src/services/tron.service.js';
test('TRON swap amounts, slippage and shared wallet requirements',()=>{
 assert.equal(createTronWeb().address.toHex(TRX_WRAPPED),'41891cdb91d149f23b1a45d9c5ca78a88d0cb44c18');
 assert.equal(swapAmount('0.123456'),'0.123456');assert.equal(minOutput('1234567',100),'1222221');
 for(const v of ['0','-1','NaN','1.0000001'])assert.throws(()=>swapAmount(v));
 assert.throws(()=>minOutput('100',10000));
 assert.throws(()=>tronWalletCompatibility([{currency:'TRX',address:'a',private_key:'x'},{currency:'USDT',address:'b'}]));
});
test('Swap receipts only count expected USDT contract and recipient',()=>{
 const t=createTronWeb(),address='TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq',owner=t.address.toHex(address).slice(-40);
 const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 const receipt={log:[{address:t.address.toHex(TRON_USDT_CONTRACT).slice(-40),topics:[topic,'0'.repeat(64),owner.padStart(64,'0')],data:'f4240'.padStart(64,'0')} ]};
 assert.equal(swapReceiptOutput(receipt,{address,input_currency:'TRX'}),1000000n);
 assert.equal(swapReceiptOutput({log:[]},{address,input_currency:'TRX'}),0n);
 assert.throws(()=>swapReceiptOutput(receipt,{address,input_currency:'USDT',input_amount:'1'}));
});
test('TRON settlement credits once and releases full reserved budget',async()=>{
 const old=db.getConnection;let status='active',credits=0,debited;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT status'))return [[{status}]];
  if(sql.startsWith('UPDATE wallets SET balance=balance-?+?')){debited=args;return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE wallets SET balance=balance+?')){credits++;assert.equal(args[0],'3.5');return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE tron_swaps')){status=args[0];return [{affectedRows:1}];}
  throw new Error('Unexpected SQL');
 }});
 try{const job={id:'swap',input_currency:'TRX',input_amount:'10',reserve_trx:'152',minimum_output:'3',user_id:42};await settleTronSwap(job,true,'3.5','2');await settleTronSwap(job,true,'3.5','2');assert.equal(credits,1);assert.deepEqual(debited,['12.000000','0','162.000000',42,'12.000000','162.000000']);}finally{db.getConnection=old;await db.end();}
});
