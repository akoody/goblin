import { Router } from 'express';
import { marketIdentity, cookieToken, MARKET_COOKIE } from '../services/market-session.service.js';
import { marketOperation } from '../services/market-app.service.js';
import { createRateLimit } from '../middleware/rate-limit.js';
import { getPlatformFeatures, assertPlatformFeature } from '../services/platform-features.service.js';
import { isCommerceAdmin } from '../services/commerce.service.js';
import {catalogVisitorHash,recordCatalogVisit} from '../services/market-popularity.service.js';
const router=Router();
router.get('/availability',async(req,res)=>{
  try {
    const {market}=await getPlatformFeatures();
    const user=market?null:await marketIdentity(cookieToken(req));
    res.set('Cache-Control','no-store').json({enabled:market,administrator:Boolean(user&&await isCommerceAdmin(user.id))});
  }catch {res.status(503).json({enabled:false,administrator:false});}
});
router.get('/session',async(req,res)=>{
  const token=cookieToken(req),user=await marketIdentity(token);
  res.set('Cache-Control','no-store').json({token:user?token:null});
});
router.post('/logout',(req,res)=>{
  if(req.headers.origin&&!['https://cryptogoblin.ru','https://www.cryptogoblin.ru','http://localhost:5173'].includes(req.headers.origin))return res.sendStatus(403);
  res.clearCookie(MARKET_COOKIE,{path:'/',httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}).json({ok:true});
});
router.post('/rpc',createRateLimit({windowMs:60000,max:600,message:'Слишком много запросов. Повторите позже.'}),async(req,res)=>{
  try {
    const token=String(req.headers.authorization||'').replace(/^Bearer /,''),identity=await marketIdentity(token);
    if(token&&!identity)return res.status(401).json({code:'UNAUTHORIZED'});
    if(req.body.operation!=='currentUser')await assertPlatformFeature('market',Boolean(identity&&await isCommerceAdmin(identity.id)));
    res.set('Cache-Control','no-store').json({result:await marketOperation(req.body.operation,req.body.args,identity)});
  } catch(error) {
    if(!error.status)console.error('Market RPC:',req.body?.operation,error.message);
    const domainError=/^[A-Z_]+$/.test(error.message);
    res.status(error.status||(domainError?400:503)).json({code:error.status&&error.code?error.code:domainError?error.message:'MARKET_UNAVAILABLE'});
  }
});
router.post('/catalog-visits',createRateLimit({windowMs:60000,max:90,message:'Слишком много переходов.'}),async(req,res)=>{
  try {
    await assertPlatformFeature('market');
    const identity=await marketIdentity(cookieToken(req));
    const visitorHash=catalogVisitorHash({userId:identity?.id,ip:req.ip,userAgent:req.get('user-agent')});
    const result=await recordCatalogVisit({slug:req.body?.slug,area:req.body?.area,visitorHash});
    res.set('Cache-Control','no-store').json(result);
  }catch(error){res.status(error.status||503).json({code:error.status?error.message:'VISIT_UNAVAILABLE'});}
});
export default router;
