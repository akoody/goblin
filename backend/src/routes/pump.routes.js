import express from 'express';
import Decimal from 'decimal.js';
import {db} from '../config/db.js';
import {auth} from '../middleware/auth.js';
import {staffAccess} from '../services/staff-access.service.js';
import {createRateLimit} from '../middleware/rate-limit.js';
import {transact} from '../services/commerce.service.js';
import {swapConfigured,atomicSol} from '../services/solana-client.js';
import {pumpState,draftLaunch,executeLaunch} from '../services/pump-launch.service.js';
const router=express.Router();
const handle=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store').json(await fn(req));}catch(e){res.status(e.status||400).json({message:e.status?e.message:'Не удалось выполнить операцию запуска. Проверьте параметры и повторите.'});}};
for(const kind of ['metadata','image'])router.get(kind==='metadata'?['/metadata/:id','/m/:id']:'/image/:id',async(req,res)=>{
 try{
  if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);
  const [[row]]=await db.execute(`SELECT ${kind==='metadata'?'metadata_json':'image_data'} FROM pump_launches WHERE id=?`,[req.params.id]);if(!row)return res.sendStatus(404);
  res.set({'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
  if(kind==='metadata')return res.json(typeof row.metadata_json==='string'?JSON.parse(row.metadata_json):row.metadata_json);
  const [header,data]=row.image_data.split(',');res.type(header.includes('image/png')?'png':'jpeg').send(Buffer.from(data,'base64'));
 }catch{res.sendStatus(503);}
});
router.use(auth);
router.get('/state',handle(req=>pumpState(req.user.userId)));
router.post('/draft',createRateLimit({windowMs:60000,max:3,message:'Слишком много запросов запуска'}),handle(req=>draftLaunch(req.user.userId,req.body)));
router.post('/:id/execute',createRateLimit({windowMs:60000,max:3,message:'Слишком много запросов запуска'}),handle(req=>executeLaunch(req.user.userId,req.params.id)));
router.use('/admin',async(req,res,next)=>{try{if((await staffAccess(req.user.userId)).role!=='admin')return res.sendStatus(403);next();}catch{res.sendStatus(503);}});
router.get('/admin/policy',handle(async()=>{const [[p]]=await db.query('SELECT * FROM pump_policy WHERE id=1');return {...p,enabled:Boolean(p.enabled),configured:swapConfigured()};}));
router.get('/admin/launches',handle(async()=>{const [rows]=await db.query('SELECT id,user_id,name,symbol,mint,status,signature,cost_atomic,created_at FROM pump_launches ORDER BY created_at DESC LIMIT 100');const [[stats]]=await db.query('SELECT COUNT(*) AS count,COALESCE(SUM(amount_sol),0) AS total_sol FROM pump_fee_ledger');return {rows,stats};}));
router.post('/admin/policy',handle(async req=>{
 const b=req.body;try{for(const k of ['service_fee_sol','minimum_buy_sol','network_budget_sol'])atomicSol(b[k]);}catch{throw Object.assign(new Error('Введите положительные суммы SOL'),{status:400});}
 if(typeof b.enabled!=='boolean'||new Decimal(b.service_fee_sol).gt(100)||new Decimal(b.minimum_buy_sol).gt(100)||new Decimal(b.network_budget_sol).gt('0.2'))throw Object.assign(new Error('Проверьте суммы и резерв сети (до 0,2 SOL)'),{status:400});
 if(b.enabled&&!swapConfigured())throw Object.assign(new Error('Сначала подключите Solana и серверную подпись'),{status:409});
 const policy={enabled:b.enabled,service_fee_sol:b.service_fee_sol,minimum_buy_sol:b.minimum_buy_sol,network_budget_sol:b.network_budget_sol};
 await transact(async c=>{await c.query('SELECT id FROM pump_policy WHERE id=1 FOR UPDATE');await c.execute('UPDATE pump_policy SET enabled=?,service_fee_sol=?,minimum_buy_sol=?,network_budget_sol=?,updated_by=? WHERE id=1',[b.enabled?1:0,b.service_fee_sol,b.minimum_buy_sol,b.network_budget_sol,req.user.userId]);await c.execute('INSERT INTO pump_policy_audit(actor_id,policy_json) VALUES(?,?)',[req.user.userId,JSON.stringify(policy)]);});return {success:true};
}));
export default router;
