import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { updateDepositFee } from '../src/services/deposit-compliance.service.js';
test('Fee edits are validated, transactional and audited without changing prior deposits',async()=>{
  const original=db.getConnection,statements=[];
  db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
    statements.push({sql,args});if(sql.startsWith('SELECT'))return [[{fee_usd:'2.00'}]];return [{affectedRows:1}];
  }});
  try{
    assert.deepEqual(await updateDepositFee(42,'1.25'),{feeUsd:'1.25'});
    assert(statements.some(s=>s.sql.startsWith('UPDATE deposit_policy')&&s.args[0]==='1.25'&&s.args[1]===42));
    assert(statements.some(s=>s.sql.includes('deposit_policy_audit')&&s.args[1]==='2.00'));
    assert(!statements.some(s=>/UPDATE (wallets|deposit_reviews|blockchain_deposits)/.test(s.sql)));
    for(const value of ['-1','5','1.234','NaN','Infinity'])await assert.rejects(()=>updateDepositFee(42,value),e=>e.status===400);
  }finally{db.getConnection=original;await db.end();}
});
