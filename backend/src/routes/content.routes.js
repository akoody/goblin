import express from 'express';
import {db} from '../config/db.js';
import {auth} from '../middleware/auth.js';
import {staffAccess} from '../services/staff-access.service.js';
import path from 'node:path';
import {transact} from '../services/commerce.service.js';
import {createRateLimit} from '../middleware/rate-limit.js';
import {mediaDirectory,uploadNewsMedia,withNewsMedia} from '../services/news-media.service.js';
const router=express.Router();
const handle=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store').json(await fn(req));}catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось обработать содержимое'});}};
const bad=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)bad('Проверьте текст и его длину');return v.trim();};
const id=v=>{if(!/^\d+$/.test(v))bad('Некорректный ID');return v;};
router.get('/news',handle(async req=>{const category=req.query.category||'project';if(!['project','crypto'].includes(category))bad('Некорректная категория');const [rows]=await db.execute('SELECT id,category,title,body,created_at,updated_at FROM site_articles WHERE category=? AND published=1 ORDER BY created_at DESC,id DESC LIMIT 100',[category]);return withNewsMedia(rows);}));
router.get('/media/:id',async(req,res)=>{
 try{
  if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);
  const [[row]]=await db.execute('SELECT m.mime FROM site_media m JOIN site_article_media am ON am.media_id=m.id JOIN site_articles a ON a.id=am.article_id WHERE m.id=? AND a.published=1 LIMIT 1',[req.params.id]);
  if(!row)return res.sendStatus(404);
  res.set({'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.sendFile(path.join(mediaDirectory,req.params.id),error=>{if(error&&!res.headersSent)res.sendStatus(error.statusCode||404);});
 }catch{if(!res.headersSent)res.sendStatus(503);}
});
router.get('/about',handle(async()=>{const [[row]]=await db.query('SELECT body,telegram_links FROM site_about WHERE id=1');return {body:row.body,links:typeof row.telegram_links==='string'?JSON.parse(row.telegram_links):row.telegram_links};}));
router.use('/admin',auth,async(req,res,next)=>{try{if((await staffAccess(req.user.userId)).role!=='admin')return res.status(403).json({message:'Только для администратора'});next();}catch{res.status(500).json({message:'Не удалось проверить права'});}});
router.get('/admin/news',handle(async()=>{const [rows]=await db.query('SELECT * FROM site_articles ORDER BY created_at DESC,id DESC LIMIT 500');return withNewsMedia(rows);}));
router.get('/admin/media/:id',async(req,res)=>{try{if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);const [[row]]=await db.execute('SELECT mime FROM site_media WHERE id=?',[req.params.id]);if(!row)return res.sendStatus(404);res.set({'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.sendFile(path.join(mediaDirectory,req.params.id),e=>{if(e&&!res.headersSent)res.sendStatus(e.statusCode||404);});}catch{if(!res.headersSent)res.sendStatus(503);}});
router.post('/admin/media',createRateLimit({windowMs:60000,max:10,message:'Подождите перед следующей загрузкой'}),express.raw({type:'application/octet-stream',limit:'20mb'}),handle(req=>uploadNewsMedia(req.user.userId,req.body,req.query.name)));
router.post('/admin/news',handle(async req=>{
 const {category,published}=req.body;if(!['project','crypto'].includes(category)||typeof published!=='boolean')bad('Проверьте категорию и статус');
 const title=text(req.body.title,200),body=text(req.body.body,20000),media=req.body.media??[];
 if(!Array.isArray(media)||media.length>10||media.some(m=>!m||! /^[a-f0-9-]{36}$/.test(m.id))||new Set(media.map(m=>m.id)).size!==media.length)bad('Добавьте не более 10 разных файлов');
 return transact(async c=>{
  let articleId=req.body.id?id(String(req.body.id)):null;
  if(articleId){const [[old]]=await c.execute('SELECT id FROM site_articles WHERE id=? FOR UPDATE',[articleId]);if(!old)throw Object.assign(new Error('Новость не найдена'),{status:404});await c.execute('UPDATE site_articles SET category=?,title=?,body=?,published=? WHERE id=?',[category,title,body,published?1:0,articleId]);}
  else{const [r]=await c.execute('INSERT INTO site_articles(category,title,body,published) VALUES(?,?,?,?)',[category,title,body,published?1:0]);articleId=r.insertId;}
  await c.execute('DELETE FROM site_article_media WHERE article_id=?',[articleId]);
  for(let i=0;i<media.length;i++){const [[file]]=await c.execute('SELECT id FROM site_media WHERE id=?',[media[i].id]);if(!file)bad('Медиафайл не найден. Загрузите его снова.');await c.execute('INSERT INTO site_article_media(article_id,media_id,position) VALUES(?,?,?)',[articleId,media[i].id,i]);}
  return {success:true,id:articleId};
 });
}));
router.post('/admin/about',handle(async req=>{const body=text(req.body.body,20000);if(!Array.isArray(req.body.links)||req.body.links.length>10)bad('Максимум 10 ссылок');const links=req.body.links.map(link=>{const label=text(link.label,100);let url;try{url=new URL(link.url);}catch{bad('Некорректная ссылка Telegram');}if(url.protocol!=='https:'||url.hostname!=='t.me'||url.username||url.password||!url.pathname.slice(1))bad('Используйте ссылку https://t.me/…');return {label,url:url.href};});await db.execute('UPDATE site_about SET body=?,telegram_links=? WHERE id=1',[body,JSON.stringify(links)]);return {success:true};}));
export default router;
