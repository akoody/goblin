import express from 'express';
import {vapid} from '../services/web-push.service.js';
import {auth} from '../middleware/auth.js';
import {createRateLimit} from '../middleware/rate-limit.js';
import {registerPushDevice,unregisterPushDevice} from '../services/push.service.js';
import {staffAccess} from '../services/staff-access.service.js';
import {broadcastAudience,broadcastProgress,startBroadcast} from '../services/push-broadcast.service.js';

const router=express.Router();
router.use(auth,createRateLimit({windowMs:60000,max:30,message:'Слишком много запросов уведомлений'}));
router.get('/web-config',(_req,res)=>{const keys=vapid();res.status(keys?200:503).json(keys?{publicKey:keys.publicKey}:{message:'Web Push пока недоступен'});});
router.use('/broadcasts',async(req,res,next)=>{
 try{if((await staffAccess(req.user.userId)).role!=='admin')return res.status(403).json({message:'Рассылка доступна только администратору'});next();}
 catch{res.status(503).json({message:'Не удалось проверить права'});}
});
router.get('/broadcasts/audience',async(_req,res)=>{try{res.json(await broadcastAudience());}catch{res.status(503).json({message:'Не удалось получить получателей'});}});
router.get('/broadcasts/:id',async(req,res)=>{const progress=broadcastProgress(req.params.id);res.status(progress?200:404).json(progress||{message:'Данные рассылки недоступны после перезапуска сервера'});});
router.post('/broadcasts',async(req,res)=>{try{res.status(202).json(await startBroadcast(req.body));}catch(error){res.status(error.status||503).json({message:error.status?error.message:'Не удалось запустить рассылку'});}});
router.post('/devices',async(req,res)=>{
 try{
  const valid=await registerPushDevice(req.user,req.headers.authorization,req.body?.deviceId,req.body?.token);
  res.status(valid?200:400).json(valid?{success:true}:{message:'Некорректные данные устройства'});
 }catch{res.status(503).json({message:'Не удалось подключить уведомления'});}
});
router.post('/devices/remove',async(req,res)=>{
 try{
  await unregisterPushDevice(req.user.userId,req.headers.authorization,req.body?.deviceId);
  res.json({success:true});
 }catch{res.status(503).json({message:'Не удалось отключить уведомления'});}
});
export default router;
