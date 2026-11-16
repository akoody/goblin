import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {staffAccess} from '../src/services/staff-access.service.js';

const base=process.env.RELEASE_CHECK_URL||'https://cryptogoblin.ru';
try{
 const [users]=await db.query("SELECT id,token_version FROM users WHERE status='active'");
 let admin,normal;
 for(const user of users){const role=(await staffAccess(user.id)).role;if(role==='admin')admin=user;else normal=user;if(admin&&normal)break;}
 assert(admin);
 const token=user=>signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)});
 const request=user=>fetch(base+'/api/push/broadcasts/audience',{headers:user?{Authorization:`Bearer ${token(user)}`}:{},signal:AbortSignal.timeout(10000)});
 assert.equal((await request()).status,401);
 if(normal)assert.equal((await request(normal)).status,403);
 const response=await request(admin);assert.equal(response.status,200);
 const audience=await response.json();assert(Number.isInteger(audience.devices)&&Number.isInteger(audience.users));assert.equal(audience.enabled,true);
 console.log(JSON.stringify({adminPreview:true,anonymousDenied:true,nonAdminDenied:Boolean(normal),audience,mutatingRequests:0,realBroadcastsSent:0}));
}finally{await db.end();}
