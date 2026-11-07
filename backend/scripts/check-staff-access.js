import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import {staffAccess,isAdministratorEmail} from '../src/services/staff-access.service.js';

try {
  const [users]=await db.query("SELECT id,email,token_version FROM users WHERE status='active' LIMIT 1000");
  const admin=users.find(u=>isAdministratorEmail(u.email));
  assert(admin,'No active administrator found');
  const base=`http://127.0.0.1:${process.env.PORT||3000}`;
  const get=(user,path)=>fetch(base+path,{headers:{Authorization:`Bearer ${signAccessToken({userId:user.id,tokenVersion:Number(user.token_version||0)})}`}});
  for(const path of ['/admin/access','/admin/helpers','/support/tickets','/admin/login-ips','/admin/wallet-users',`/admin/wallet-users/${admin.id}/balances`])assert.equal((await get(admin,path)).status,200,path);
  const controls=await get(admin,'/admin/users');assert.equal(controls.status,200);
  const accounts=await controls.json();
  assert(accounts.length>0);
  for(const key of ['nftEnabled','guarantorEnabled','tradingEnabled'])assert.equal(typeof accounts[0][key],'boolean',key);
  const user=users.find(u=>!isAdministratorEmail(u.email));
  if(user && (await staffAccess(user.id)).role==='user') {
    for(const path of ['/admin/helpers','/admin/login-ips','/admin/transactions','/admin/deposit-compliance','/admin/wallet-users',`/admin/wallet-users/${admin.id}/balances`])assert.equal((await get(user,path)).status,403,path);
  }
  // Real SQL on session-local tables, without changing application accounts.
  const c=await db.getConnection();
  try {
    await c.query('CREATE TEMPORARY TABLE users (id BIGINT PRIMARY KEY,email VARCHAR(255),status VARCHAR(24))');
    await c.query('CREATE TEMPORARY TABLE staff_helpers (user_id BIGINT PRIMARY KEY,enabled TINYINT)');
    await c.query('CREATE TEMPORARY TABLE staff_helper_permissions (user_id BIGINT,permission VARCHAR(40))');
    await c.execute("INSERT INTO users VALUES (1,'helper-check@example.invalid','active')");
    await c.execute('INSERT INTO staff_helpers VALUES (1,1)');
    await c.execute("INSERT INTO staff_helper_permissions VALUES (1,'chat')");
    assert.deepEqual(await staffAccess(1,c),{role:'helper',permissions:['chat']});
    await c.execute('DELETE FROM staff_helper_permissions WHERE user_id=1');
    assert.deepEqual(await staffAccess(1,c),{role:'helper',permissions:[]});
    await c.execute('UPDATE staff_helpers SET enabled=0 WHERE user_id=1');
    assert.equal((await staffAccess(1,c)).role,'user');
    console.log('Administrator endpoints, ordinary user denial, helper permissions and revocation: passed');
  } finally {c.destroy();}
} finally {await db.end();}
