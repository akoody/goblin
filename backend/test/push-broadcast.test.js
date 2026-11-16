import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {db} from '../src/config/db.js';
import {getJwtSecret,signAccessToken} from '../src/config/jwt.js';
import {encryptPushToken} from '../src/services/push-crypto.js';
import pushRoutes from '../src/routes/push.routes.js';
import {startBroadcast,broadcastProgress,dispatchPendingNewsNotification} from '../src/services/push-broadcast.service.js';

test('Broadcast is admin-only, idempotent in memory and rechecks logout before each send',async()=>{
 const original=db.execute,originalFetch=globalThis.fetch,previous={PUSH_ENABLED:process.env.PUSH_ENABLED,PUSH_CREDENTIALS_FILE:process.env.PUSH_CREDENTIALS_FILE,ADMIN_EMAILS:process.env.ADMIN_EMAILS};
 const dir=await mkdtemp(join(tmpdir(),'goblin-push-test-'));
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 await writeFile(join(dir,'credential.json'),JSON.stringify({project_id:'qa-project',client_email:'qa@qa.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})}),{mode:0o600});
 Object.assign(process.env,{PUSH_ENABLED:'true',PUSH_CREDENTIALS_FILE:join(dir,'credential.json'),ADMIN_EMAILS:'admin@qa.invalid'});
 let role='helper',bound=true,newsPending=false;
 const sent=[];
 db.execute=async sql=>{
  if(sql.includes("COALESCE(status, 'active')"))return [[{status:'active',token_version:0}]];
  if(sql.includes('SELECT id,email,status FROM users'))return [[{id:1,email:role==='admin'?'admin@qa.invalid':'helper@qa.invalid',status:'active'}]];
  if(sql.includes('FROM staff_helpers'))return [[{permission:'chat'}]];
  if(sql.includes('COUNT(*) devices'))return [[{devices:1,users:1}]];
  if(sql.includes('FROM site_news_notifications n'))return [newsPending?[{id:7,title:'Новая публикация',category:'crypto'}]:[]];
  if(sql.startsWith('UPDATE site_news_notifications')){newsPending=false;return [{affectedRows:1}];}
  if(sql.startsWith('SELECT d.device_id,d.user_id'))return [[{device_id:'device',user_id:2,token_hash:'qa-hash',token_cipher:encryptPushToken('qa-fake-device-token',getJwtSecret())}]];
  if(sql.startsWith('SELECT d.device_id'))return [bound?[{device_id:'device'}]:[]];
  throw Error(`Unexpected SQL: ${sql}`);
 };
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('oauth2.googleapis.com'))return {ok:true,json:async()=>({access_token:'qa-access',expires_in:3600})};
  if(String(url).includes('fcm.googleapis.com')){sent.push(JSON.parse(options.body).message);return {ok:true,status:200,json:async()=>({name:'qa'})};}
  return originalFetch(url,options);
 };
 const app=express();app.use(express.json());app.use('/api/push',pushRoutes);
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const headers={Authorization:`Bearer ${signAccessToken({userId:1,tokenVersion:0})}`};
 const url=`http://127.0.0.1:${server.address().port}/api/push/broadcasts/audience`;
 const wait=async id=>{for(let i=0;i<200&&broadcastProgress(id)?.status==='sending';i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(broadcastProgress(id).status,'finished');};
 try{
  assert.equal((await originalFetch(url,{headers})).status,403);
  role='admin';assert.equal((await originalFetch(url,{headers})).status,200);
  const body={title:'QA',body:'Тест без реальной отправки',path:'/news',expectedDevices:1,requestKey:randomUUID()};
  const job=await startBroadcast(body);await wait(job.id);assert.equal(job.accepted,1);assert.equal(sent.length,1);
  assert.equal(sent[0].notification.body,'Тест без реальной отправки');
  assert.equal((await startBroadcast(body)).id,job.id);assert.equal(sent.length,1);
  bound=false;const skipped=await startBroadcast({...body,requestKey:randomUUID()});await wait(skipped.id);assert.equal(skipped.skipped,1);assert.equal(sent.length,1);
  bound=true;newsPending=true;
  const news=await dispatchPendingNewsNotification();await wait(news.id);
  assert.equal(news.accepted,1);
  assert.equal(sent[1].notification.body,'Новая публикация');
  assert.equal(sent[1].data.path,'/news?category=crypto&article=7');
  assert.equal(await dispatchPendingNewsNotification(),undefined);
  assert.equal(sent.length,2);
  assert.equal((await originalFetch(url)).status,401);
 }finally{
  await new Promise(resolve=>server.close(resolve));db.execute=original;globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await rm(dir,{recursive:true});await db.end();
 }
});
