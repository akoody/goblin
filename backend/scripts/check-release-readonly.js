// Production smoke check: authentication and reads only. No deposits, orders,
// withdrawals, policy edits, or account creation are performed.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';

const base=process.env.RELEASE_CHECK_URL||'https://cryptogoblin.ru';
const emails=String(process.env.ADMIN_EMAILS||process.env.VITE_ADMIN_EMAILS||'').split(/[,;\n]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
async function get(path,token,status=200){
  const response=await fetch(base+path,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,path);
  return status===200?response.json():null;
}
try{
  assert(emails.length,'No administrator configuration');
  const [users]=await db.query('SELECT id,email,token_version FROM users WHERE status=\'active\'');
  const admin=users.find(u=>emails.includes(String(u.email).toLowerCase()));assert(admin,'No active administrator');
  const token=signAccessToken({userId:admin.id,tokenVersion:Number(admin.token_version||0)});
  await get('/api/features');
  await get('/admin/transaction-history',null,401);
  const access=await get('/admin/access',token);assert.equal(access.role,'admin');
  const inventory=await get(`/admin/wallet-users/${admin.id}/balances`,token);assert(inventory.wallets.some(w=>w.currency==='SOL'));
  const accounts=await get('/admin/users',token);assert(accounts.every(u=>typeof u.marketAccountsEnabled==='boolean'&&typeof u.marketServicesEnabled==='boolean'));
  for(const direction of ['','IN','OUT','INTERNAL']){
    const history=await get('/admin/transaction-history?direction='+direction,token);
    assert(Array.isArray(history.rows));assert(history.rows.length<=50);assert(Number.isInteger(history.total));
  }
  const filtered=await get('/admin/transaction-history?from=2026-01-01T00:00:00Z&until=2027-01-01T00:00:00Z&min=0&max=100000&address=not-a-real-address-qa',token);
  assert.equal(filtered.rows.length,0);
  const own=await get('/api/transactions/statement',token);assert(Array.isArray(own.rows));
  const [helpers]=await db.query('SELECT user_id FROM staff_helpers WHERE enabled=1');
  const normal=users.find(u=>!emails.includes(String(u.email).toLowerCase())&&!helpers.some(h=>Number(h.user_id)===Number(u.id)));
  if(normal)await get('/admin/transaction-history',signAccessToken({userId:normal.id,tokenVersion:Number(normal.token_version||0)}),403);
  console.log(JSON.stringify({publicApi:true,adminHistory:true,filters:true,ownHistory:true,solBalances:true,marketAreaControls:true,anonymousDenied:true,ordinaryAccountDenied:Boolean(normal),mutatingRequests:0}));
}finally{await db.end();}
