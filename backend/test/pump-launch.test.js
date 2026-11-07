import test from 'node:test';
import assert from 'node:assert/strict';
import {launchInput,solUnits} from '../src/services/pump-launch-validation.js';
import {settleLaunch} from '../src/services/pump-launch.service.js';
import {db} from '../src/config/db.js';
const policy={minimum_buy_sol:'0.2',service_fee_sol:'1',network_budget_sol:'0.05'};
const body={name:'Example',symbol:'EX',description:'Example',image:'data:image/png;base64,iVBORw0KGgo=',buySol:'0.2'};
test('Launch prices are exact; first purchase is separate from service fee',()=>{
 const v=launchInput(body,policy);assert.equal(v.reserve,'1250000000');assert.equal(v.fee,'1000000000');assert.equal(solUnits(v.reserve),'1.250000000');
 for(const bad of [{buySol:'0.199999999'},{symbol:'bad symbol'},{image:'data:image/svg+xml;base64,AAAA'},{website:'http://test.com'},{name:'я'.repeat(17)}])assert.throws(()=>launchInput({...body,...bad},policy));
});
test('Launch settlement charges service fee only on success and credits once',async()=>{
 const original=db.getConnection;let current='prepared',treasury=0,token=0,debit;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT status'))return [[{status:current}]];
  if(sql.startsWith('UPDATE wallets')){debit=args;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO solana_holdings')){token++;return [{}];}
  if(sql.startsWith('INSERT INTO pump_fee_ledger'))return [{}];
  if(sql.startsWith('INSERT INTO admin_treasury')){treasury++;return [{}];}
  if(sql.startsWith('UPDATE pump_launches')){current=args[0];return [{}];}throw new Error(sql);
 }});
 try{
  const job={id:'id',user_id:1,mint:'mint',service_fee_atomic:'1000000000',reserve_atomic:'1250000000'};
  await settleLaunch(job,210000000n,123n,'completed');await settleLaunch(job,210000000n,123n,'completed');assert.equal(treasury,1);assert.equal(token,1);assert.equal(debit[0],'1.210000000');
  current='submitted';await settleLaunch(job,5000n,0n,'failed');assert.equal(treasury,1);assert.equal(token,1);assert.equal(debit[0],'0.000005000');assert.equal(debit[1],'1.250000000');
 }finally{db.getConnection=original;await db.end();}
});
