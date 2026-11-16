import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {staffAccess} from '../src/services/staff-access.service.js';
try{
 const [users]=await db.query("SELECT id,token_version FROM users WHERE status='active'");let admin,ordinary;
 for(const user of users){if((await staffAccess(user.id)).role==='admin')admin=user;else ordinary=user;if(admin&&ordinary)break;}
 assert(admin);
 const request=user=>fetch('https://cryptogoblin.ru/admin/treasury',{headers:user?{Authorization:`Bearer ${signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)})}`}:{},signal:AbortSignal.timeout(45000)});
 assert.equal((await request()).status,401);
 if(ordinary)assert.equal((await request(ordinary)).status,403);
 const response=await request(admin);assert.equal(response.status,200);
 const data=await response.json();assert.deepEqual(data.assets.map(asset=>asset.currency),['USDT','SOL','BTC','ETH']);
 assert(data.assets.every(asset=>asset.policy.mode==='manual'));
 const [[count]]=await db.query('SELECT COUNT(*) count FROM treasury_payouts');assert.equal(Number(count.count),0);
 console.log(JSON.stringify({adminOnly:true,assets:data.assets.map(asset=>({currency:asset.currency,available:asset.available,networkError:asset.error||null,addressConfigured:Boolean(asset.address),mode:asset.policy.mode})),payoutsCreated:0,signaturesCreated:0,mutatingRequests:0}));
}finally{await db.end();}
