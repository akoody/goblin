import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/config/db.js';
import adminRoutes from '../src/routes/admin.routes.js';
import {staffAccess,hasStaffPermission,validateHelperConfiguration,helperRoutePermission,saveHelper} from '../src/services/staff-access.service.js';

test('Helper permissions are checked live, disabled staff lose access and unknown rights are rejected',async()=>{
  const original=db.execute,originalEnv=process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS='owner@example.test';
  let enabled=true,permissions=['chat','security'];
  db.execute=async(sql)=>sql.includes('FROM users')?[[{id:2,email:'helper@example.test',status:'active'}]]:[enabled?permissions.length?permissions.map(permission=>({permission})):[{permission:null}]:[]];
  try{
    assert.deepEqual(await staffAccess(2),{role:'helper',permissions:['chat','security']});
    assert.equal(await hasStaffPermission(2,'chat'),true);
    permissions=['security'];assert.equal(await hasStaffPermission(2,'chat'),false);
    enabled=false;assert.equal((await staffAccess(2)).role,'user');
    for(const configuration of [{enabled:true,permissions:['treasury']},{enabled:true,permissions:[['chat']]},{enabled:true,permissions:['chat','chat']},{enabled:1,permissions:[]}])assert.throws(()=>validateHelperConfiguration(configuration));
    assert.equal(helperRoutePermission('GET','/login-ips'),'security');
    assert.equal(helperRoutePermission('GET','/wallet-users'),'balances');
    assert.equal(helperRoutePermission('GET','/wallet-users/42/balances'),'balances');
    assert.equal(helperRoutePermission('POST','/wallet-users/42/balances'),null);
    assert.equal(helperRoutePermission('GET','/wallet-users/42/private-key'),null);
    assert.equal(helperRoutePermission('PATCH','/login-ips/42/review'),'security');
    assert.equal(helperRoutePermission('POST','/referrals/42/link'),'referrals');
    for(const path of ['/helpers','/users/2/controls','/deposit-compliance/2/review','/treasury-auto-withdrawal-policy','/deals','/processing','/features/p2p'])assert.equal(helperRoutePermission('POST',path),null);
  }finally{db.execute=original;if(originalEnv===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=originalEnv;}
});

test('Helper cannot reach administrator endpoints directly or promote accounts',async()=>{
  const original=db.execute,oldConnection=db.getConnection;
  db.execute=async(sql)=>sql.includes('FROM users')?[[{id:2,email:'helper@example.test',status:'active'}]]:[[{permission:'security'}]];
  const app=express();app.use((req,_res,next)=>{req.user={userId:2};next();});app.use('/admin',adminRoutes);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const [method,path] of [['GET','helpers'],['POST','helpers'],['GET','transactions'],['GET','deposit-compliance'],['PATCH','users/2/controls'],['POST','deals'],['PATCH','p2p-fee-policy']]){
      assert.equal((await fetch(`${base}/admin/${path}`,{method})).status,403,`${method} ${path}`);
    }
    assert.equal((await fetch(`${base}/admin/access`)).status,200);
    let wrote=false;
    db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{if(!sql.startsWith('SELECT'))wrote=true;return db.execute(sql,args);}});
    await assert.rejects(()=>saveHelper(2,'3',{enabled:true,permissions:['chat']}),e=>e.status===403);
    assert.equal(wrote,false);
  }finally{await new Promise(resolve=>server.close(resolve));db.execute=original;db.getConnection=oldConnection;await db.end();}
});
