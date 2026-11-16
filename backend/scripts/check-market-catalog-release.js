import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {staffAccess} from '../src/services/staff-access.service.js';

const fingerprint=async()=>{const [[row]]=await db.query('SELECT payload FROM market_application_state WHERE id=1');const payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;return createHash('sha256').update(JSON.stringify(payload.catalogItems)).digest('hex');};
try{
 const [users]=await db.query("SELECT id,token_version FROM users WHERE status='active'");let admin;
 for(const user of users)if((await staffAccess(user.id)).role==='admin'){admin=user;break;}
 assert(admin);const token=signAccessToken({userId:admin.id,tokenVersion:Number(admin.token_version||0)}),before=await fingerprint();
 const response=await fetch('https://cryptogoblin.ru/market/admin',{headers:{Cookie:`goblin_market_session=${token}`},signal:AbortSignal.timeout(45000)});
 assert.equal(response.status,200);const html=await response.text();
 assert(html.includes('Доступность категорий и подкатегорий'));assert(html.includes('catalog-kinds'));assert(html.includes('catalog-families'));
 assert(html.includes('Доступность аккаунтов'));assert(html.includes('Доступность услуг'));assert(!html.includes('Доступность услуг по платформам'));
 assert(!/<select[^>]+name="(?:kind|family)"/.test(html));
 for(const part of ['accounts','services']){const page=await fetch(`https://cryptogoblin.ru/market?part=${part}`,{signal:AbortSignal.timeout(45000)});assert.equal(page.status,200);}
 assert.equal(await fingerprint(),before);
 console.log(JSON.stringify({liveAdminRendering:true,manualTaxonomy:true,dynamicAvailability:true,separateAreas:true,legacyPlatformControlsRemoved:true,catalogPreserved:true,adminActionsSubmitted:0,realMoneyTransferred:false}));
}finally{await db.end();}
