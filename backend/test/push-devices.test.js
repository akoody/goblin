import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import {registerPushDevice,unregisterPushDevice} from '../src/services/push.service.js';
import {tokenHash} from '../src/services/push-crypto.js';

test('Device binding is transactional, encrypted and logout cannot revoke a newer session',async()=>{
 const getConnection=db.getConnection,execute=db.execute,queries=[];
 let committed=false,released=false;
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{},release:()=>{released=true;},execute:async(sql,args)=>{queries.push({sql,args});return [[]];}});
 db.execute=async(sql,args)=>{queries.push({sql,args});return [[]];};
 try{
  const id='6ba7b810-9dad-4d80-80b4-00c04fd430c8',token='qa-fcm-confidential-token-12345';
  assert.equal(await registerPushDevice({userId:1,tokenVersion:2},'Bearer session',id,token),true);
  assert(committed&&released);
  const insert=queries.find(q=>q.sql.startsWith('INSERT'));
  assert.equal(insert.args[1],1);assert.equal(insert.args[2],2);
  assert.equal(insert.args[3],tokenHash(token));assert(!insert.args[4].includes(token));
  assert.equal(insert.args[5],tokenHash('Bearer session'));
  await unregisterPushDevice(1,'Bearer different-session',id);
  assert(queries.at(-1).sql.includes('session_hash=?'));
  assert.deepEqual(queries.at(-1).args,[1,tokenHash('Bearer different-session'),id]);
  assert.equal(await registerPushDevice({userId:1},'Bearer session','invalid',token),false);
 }finally{db.getConnection=getConnection;db.execute=execute;await db.end();}
});
