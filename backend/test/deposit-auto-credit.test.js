import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { autoApproveDeposit } from '../src/services/deposit-compliance.service.js';

test('Automatic settlement credits net and treasury exactly once; all other AML outcomes remain held',async()=>{
  const oldExecute=db.execute,oldConnection=db.getConnection;
  let status='PENDING_AML',walletCredits=0,treasuryCredits=0,report;
  const deposit={id:1,status,currency:'USDT',amount:'10',fee_usd:'2',min_usd:'5',wallet_id:3,from_address:'Tsender'};
  const clean=()=>({status:'completed',result:{product:'screen',subject:{type:'address',value:'Tsender',network:'tron',asset:'USDT'},risk_level:'low',decision:'allow',coverage_status:'complete'}});
  db.execute=async()=>[[{currency:'USDT'}]];
  db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
    if(sql.includes('SELECT d.*'))return [[{...deposit,status}]];
    if(sql.includes('SELECT status,result_json'))return [[{status:'completed',check_id:'test-check',result_json:report}]];
    if(sql.includes('SELECT w.*'))return [[{id:3,user_id:7,status:'active',user_status:'active',deposits_enabled:1}]];
    if(sql.startsWith('UPDATE wallets')){walletCredits++;assert.equal(args[0],'8.000000');}
    if(sql.startsWith('INSERT INTO admin_treasury (')){treasuryCredits++;assert.equal(args[1],'2.000000');}
    if(sql.startsWith("UPDATE deposit_reviews SET status='CREDITED'")){status='CREDITED';assert.equal(args.at(-2),null);}
    return [{affectedRows:1}];
  }});
  try{
    for(const change of [{risk_level:'medium'},{risk_level:'high'},{coverage_status:'partial'},{decision:'review'},{decision:'block'}]){
      report=clean();Object.assign(report.result,change);
      await assert.rejects(()=>autoApproveDeposit(1));
      assert.equal(walletCredits,0);assert.equal(treasuryCredits,0);
    }
    report=clean();
    assert.equal((await autoApproveDeposit(1)).status,'CREDITED');
    assert.equal((await autoApproveDeposit(1)).status,'CREDITED');
    assert.equal(walletCredits,1);assert.equal(treasuryCredits,1);
  }finally{db.execute=oldExecute;db.getConnection=oldConnection;await db.end();}
});
