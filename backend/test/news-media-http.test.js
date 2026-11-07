import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
import {db} from '../src/config/db.js';
import {signAccessToken} from '../src/config/jwt.js';
import router from '../src/routes/content.routes.js';
import {mediaDirectory} from '../src/services/news-media.service.js';

test('News uploads survive draft/publication and media supports authenticated previews and range playback', async () => {
 const original={execute:db.execute,query:db.query,getConnection:db.getConnection,admins:process.env.ADMIN_EMAILS};
 process.env.ADMIN_EMAILS='media-test@example.invalid';
 const files=new Map();let published=false;let attached=[];let article=null;
 async function execute(sql,args){
  if(sql.includes('AS token_version FROM users'))return [[{status:'active',token_version:0}]];
  if(sql.startsWith('SELECT id,email,status'))return [[{id:args[0],email:args[0]===1?'media-test@example.invalid':'user@example.invalid',status:'active'}]];
  if(sql.includes('FROM staff_helpers'))return [[]];
  if(sql.startsWith('INSERT INTO site_media')){files.set(args[0],{id:args[0],mime:args[1],filename:args[2],size_bytes:args[3]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT m.mime'))return [published&&attached.includes(args[0])?[files.get(args[0])]:[]];
  if(sql.startsWith('SELECT mime FROM site_media')||sql.startsWith('SELECT id FROM site_media'))return [files.has(args[0])?[files.get(args[0])]:[]];
  if(sql.startsWith('INSERT INTO site_articles')){article={id:1,category:args[0],title:args[1],body:args[2]};published=Boolean(args[3]);return [{insertId:1}];}
  if(sql.startsWith('SELECT id FROM site_articles'))return [[{id:1}]];
  if(sql.startsWith('UPDATE site_articles')){published=Boolean(args[3]);return [{affectedRows:1}];}
  if(sql.startsWith('DELETE FROM site_article_media')){attached=[];return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO site_article_media')){attached.push(args[1]);return [{affectedRows:1}];}
  if(sql.includes('FROM site_articles WHERE category'))return [published?[article]:[]];
  throw new Error('Unexpected query: '+sql);
 }
 db.execute=execute;
 db.query=async sql=>{assert(sql.includes('JOIN site_media'));return [attached.map(id=>({...files.get(id),article_id:1}))];};
 db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute});
 const app=express();app.use(express.json());app.use('/api/content',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}/api/content`;
 const auth={Authorization:'Bearer '+signAccessToken({userId:1})};
 try{
  assert.equal((await fetch(base+'/admin/news')).status,401);
  assert.equal((await fetch(base+'/admin/news',{headers:{Authorization:'Bearer '+signAccessToken({userId:2})}})).status,403);
  const fixtures=[['image.png','89504e470d0a1a0a000000000000'],['animation.gif','47494638396101000100800000000000'],['audio.mp3','4944336162636465666768696a6b'],['video.mp4','000000186674797069736f6d00000000']];
  const media=[];
  for(const [name,hex] of fixtures){
   const r=await fetch(base+'/admin/media?name='+name,{method:'POST',headers:{...auth,'Content-Type':'application/octet-stream'},body:Buffer.from(hex,'hex')});
   assert.equal(r.status,200);const file=await r.json();media.push(file);
   assert.equal((await fetch(base+`/media/${file.id}`)).status,404);
   assert.equal((await fetch(base+`/admin/media/${file.id}`,{headers:auth})).status,200);
  }
  const save=payload=>fetch(base+'/admin/news',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const draft={category:'project',title:'Test',body:'Test body',published:false,media};
  assert.equal((await save(draft)).status,200);
  assert.deepEqual(await (await fetch(base+'/news')).json(),[]);
  assert.equal((await save({...draft,id:1,published:true})).status,200);
  const news=await (await fetch(base+'/news')).json();assert.equal(news[0].media.length,4);
  for(const file of media){
   const r=await fetch(base+`/media/${file.id}`,{headers:{Range:'bytes=0-7'}});
   assert.equal(r.status,206);assert(r.headers.get('content-type').startsWith(file.mime));
   assert.equal((await r.arrayBuffer()).byteLength,8);
  }
 }finally{
  await new Promise(resolve=>server.close(resolve));
  for(const id of files.keys())await unlink(path.join(mediaDirectory,id));
  db.execute=original.execute;db.query=original.query;db.getConnection=original.getConnection;
  if(original.admins===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=original.admins;
  await db.end();
 }
});
