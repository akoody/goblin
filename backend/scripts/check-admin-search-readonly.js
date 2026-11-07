import 'dotenv/config';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { signAccessToken } from '../src/config/jwt.js';
if(process.env.ADMIN_READ_CHECK!=='1')throw new Error('Explicit ADMIN_READ_CHECK=1 required');
try {
  const emails=String(process.env.ADMIN_EMAILS||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  assert(emails.length);
  const [[admin]]=await db.query('SELECT id,token_version FROM users WHERE LOWER(email) IN (?) AND status=\'active\' LIMIT 1',[emails]);assert(admin);
  const headers={Authorization:'Bearer '+signAccessToken({userId:Number(admin.id),tokenVersion:Number(admin.token_version||0)})};
  const get=async path=>{const r=await fetch('http://127.0.0.1:3000'+path,{headers});assert.equal(r.status,200,path);return r.json();};
  const features=await get('/admin/features');assert.equal(typeof features.market,'boolean');assert.equal(typeof features.guarantor,'boolean');
  const treasury=await get('/admin/deposit-compliance');assert.equal(Number(treasury.policy.minUsd),5);assert.equal(typeof treasury.policy.feeUsd,'string');assert.equal(treasury.policy.amlMode,'AWAITING_PROVIDER');assert(Array.isArray(treasury.balances)&&Array.isArray(treasury.ledger));
  const userBalance=await get('/api/transactions/balance');assert.equal(Number(userBalance.depositPolicy.minUsd),5);
  assert(Array.isArray(await get('/api/transactions/transactions')));
  const [[entry]]=await db.query('SELECT l.user_id,l.ip,u.username,u.email FROM user_login_ips l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 1');
  if(entry)for(const term of [entry.ip,entry.username,'#'+entry.user_id,entry.email].filter(Boolean)){
    const data=await get('/admin/login-ips?q='+encodeURIComponent(term));assert(data.total>0);assert(data.rows.some(r=>String(r.user_id)===String(entry.user_id)));
  }
  const empty=await get('/admin/login-ips?q='+encodeURIComponent('no-such-qa-ip-'+Date.now()));assert.equal(empty.total,0);assert.equal(empty.rows.length,0);
  const unauthorized=await fetch('http://127.0.0.1:3000/admin/login-ips');assert.equal(unauthorized.status,401);
  console.log('PASS read-only production search, access control, availability flags, treasury/fee policy and user balance/history API');
}finally{await db.end();}
