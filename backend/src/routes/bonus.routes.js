import express from 'express';
import {auth} from '../middleware/auth.js';
import {db} from '../config/db.js';
import {staffAccess} from '../services/staff-access.service.js';
import {bonusDiscount} from '../services/fee-bonus.service.js';
import {transact} from '../services/commerce.service.js';
import {randomUUID} from 'node:crypto';
const router=express.Router();
router.use(auth);
const handle=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store').json(await fn(req));}catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось обработать бонусы'});}};
router.get('/me',handle(async req=>{const [rows]=await db.execute('SELECT id,kind,note,discount_percent,created_at,used_at,revoked_at,used_deal_id FROM fee_bonuses WHERE user_id=? ORDER BY id DESC LIMIT 200',[req.user.userId]);return rows;}));
router.use('/admin',async(req,res,next)=>{try{if((await staffAccess(req.user.userId)).role!=='admin')return res.status(403).json({message:'Только администратор'});next();}catch{res.status(500).json({message:'Не удалось проверить права'});}});
router.get('/admin',handle(async()=>{const [rows]=await db.query('SELECT b.*,u.username FROM fee_bonuses b JOIN users u ON u.id=b.user_id ORDER BY b.id DESC LIMIT 200');return rows;}));
router.post('/admin',handle(async req=>{
 const {userId,kind,note}=req.body;
 if(!/^\d+$/.test(String(userId))||!['P2P','ESCROW'].includes(kind)||typeof note!=='string'||!note.trim()||note.length>500)throw Object.assign(new Error('Укажите ID пользователя, вид бонуса и описание'),{status:400});
 let discount;try{discount=bonusDiscount(req.body.discountPercent??100);}catch(e){throw Object.assign(e,{status:400});}
 const count=Number(req.body.count??1),key=String(req.body.requestKey||randomUUID());
 if(!Number.isInteger(count)||count<1||count>100||! /^[\w-]{16,128}$/.test(key))throw Object.assign(new Error('Количество бонусов: от 1 до 100'),{status:400});
 const payload=JSON.stringify({userId:String(userId),kind,note:note.trim(),discount,count});
 await transact(async c=>{
  const [[user]]=await c.execute("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);if(!user)throw Object.assign(new Error('Активный пользователь не найден'),{status:404});
  const [insert]=await c.execute('INSERT IGNORE INTO bonus_issue_batches(actor_id,request_key,payload_json) VALUES(?,?,?)',[req.user.userId,key,payload]);
  if(!insert.affectedRows){const [[old]]=await c.execute('SELECT payload_json FROM bonus_issue_batches WHERE actor_id=? AND request_key=?',[req.user.userId,key]);const value=typeof old.payload_json==='string'?JSON.parse(old.payload_json):old.payload_json;if(JSON.stringify(value)!==JSON.stringify(JSON.parse(payload))&&Object.keys(value).some(k=>value[k]!==JSON.parse(payload)[k]))throw Object.assign(new Error('Запрос уже использован с другими параметрами'),{status:409});return;}
  for(let i=0;i<count;i++)await c.execute('INSERT INTO fee_bonuses(user_id,kind,issued_by,note,discount_percent) VALUES(?,?,?,?,?)',[userId,kind,req.user.userId,note.trim(),discount]);
 });return {success:true,count};
}));
router.post('/admin/:id/revoke',handle(async req=>{if(!/^\d+$/.test(req.params.id))throw Object.assign(new Error('Некорректный ID'),{status:400});const [r]=await db.execute('UPDATE fee_bonuses SET revoked_at=NOW() WHERE id=? AND used_at IS NULL AND revoked_at IS NULL',[req.params.id]);if(!r.affectedRows)throw Object.assign(new Error('Бонус уже использован или отозван'),{status:409});return {success:true};}));
export default router;
