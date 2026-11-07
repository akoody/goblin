import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {isAdministratorEmail} from '../src/services/staff-access.service.js';
try{
 const [users]=await db.query("SELECT id,email,token_version FROM users WHERE status='active' LIMIT 1000");
 const admin=users.find(u=>isAdministratorEmail(u.email));assert(admin);
 const base=`http://127.0.0.1:${process.env.PORT||3000}`;
 const request=(user,path,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)})}`},body:body?JSON.stringify(body):undefined});
 const response=await request(admin,'/api/solana/admin/policy');assert.equal(response.status,200);
 const policy=await response.json();assert.equal(typeof policy.enabled,'boolean');assert(Number(policy.minimum_sol)>0);
 const stateResponse=await request(admin,'/api/solana/state');assert.equal(stateResponse.status,200);
 const state=await stateResponse.json();assert(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(state.address));assert(state.wallet);
 assert(!JSON.stringify(state).includes('encrypted_key'));assert(!JSON.stringify(state).includes('private_key'));
 const denied=await fetch(base+'/api/solana/state');assert.equal(denied.status,401);
 const user=users.find(u=>!isAdministratorEmail(u.email));
 if(user)assert.equal((await request(user,'/api/solana/admin/policy')).status,403);
 if(!policy.enabled)assert.equal((await request(admin,'/api/solana/quote','POST',{amount:'1',mint:'invalid',requestKey:'check-release-request'})).status,503);
 const [[tables]]=await db.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('solana_accounts','solana_holdings','solana_receipts','solana_swap_policy','solana_swaps','solana_policy_audit')");assert.equal(Number(tables.total),6);
 console.log(JSON.stringify({schema:'verified',authorization:'verified',swapEnabled:policy.enabled,rpcConfigured:policy.rpcConfigured,signingConfigured:policy.signingConfigured}));
}finally{await db.end();}
