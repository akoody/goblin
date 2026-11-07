import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {isAdministratorEmail} from '../src/services/staff-access.service.js';
import {routerQuote,ROUTER,native} from '../src/services/tron-swap-client.js';
try{
 const [users]=await db.query("SELECT id,email,token_version FROM users WHERE status='active' LIMIT 1000");
 const admin=users.find(u=>isAdministratorEmail(u.email));assert(admin);
 const base=`http://127.0.0.1:${process.env.PORT||3000}`;
 const get=(user,path)=>fetch(base+path,{headers:{Authorization:`Bearer ${signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)})}`}});
 const response=await get(admin,'/api/tron-swap/admin/policy');assert.equal(response.status,200);
 const policy=await response.json();assert(Number(policy.minimum_trx)>0);
 const state=await get(admin,'/api/tron-swap/state');assert.equal(state.status,200);const data=await state.json();assert(Array.isArray(data.swaps));assert(!JSON.stringify(data).includes('private_key'));
 assert.equal((await fetch(base+'/api/tron-swap/state')).status,401);
 const user=users.find(u=>!isAdministratorEmail(u.email));if(user)assert.equal((await get(user,'/api/tron-swap/admin/policy')).status,403);
 const output=await routerQuote(ROUTER,'TRX','10');assert(BigInt(output)>0n);
 console.log(JSON.stringify({schemaAndAccess:'verified',swapEnabled:policy.enabled,signingConfigured:policy.signingConfigured,readOnlyQuote:{input:'10 TRX',output:native(output)+' USDT'},fundsMoved:false}));
}finally{await db.end();}
