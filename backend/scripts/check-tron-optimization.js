import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {staffAccess} from '../src/services/staff-access.service.js';

try{
 const [users]=await db.query("SELECT id,token_version FROM users WHERE status='active'");let admin;
 for(const user of users)if((await staffAccess(user.id)).role==='admin'){admin=user;break;}
 assert(admin);
 const token=signAccessToken({userId:admin.id,tokenVersion:Number(admin.token_version||0)});
 async function snapshot(){
  const response=await fetch('https://cryptogoblin.ru/admin/treasury',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.tronPolling.idleIntervalMs,300000);assert.equal(data.tronPolling.activeIntervalMs,60000);
  assert(data.tronPolling.activeWallets<=12);
  return {api:data.tronApi,polling:data.tronPolling,usdtError:data.assets.find(asset=>asset.currency==='USDT')?.error||null};
 }
 const first=await snapshot();await new Promise(resolve=>setTimeout(resolve,15000));const second=await snapshot();
 console.log(JSON.stringify({before:first,after:second,networkRequestsBetweenSnapshots:second.api.requests-first.api.requests,mutatingRequests:0,realMoneyTransferred:false}));
}finally{await db.end();}
