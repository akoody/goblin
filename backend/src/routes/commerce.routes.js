import express from "express";
import {assertAccountFeature,requireAccountFeature} from '../middleware/account-feature.js';
import { auth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import * as service from "../services/commerce.service.js";
import { escrowAdminList } from '../services/escrow-admin.service.js';
import { requirePlatformFeature, assertPlatformFeature } from '../services/platform-features.service.js';
import {marketUsdtBalances,marketUsdtTransfers,transferMarketUsdt} from '../services/market-usdt.service.js';
import {maxEscrowAttachmentSize} from '../services/escrow-attachment-scan.js';
import {escrowAttachmentPath} from '../services/escrow-attachment-files.js';

const router = express.Router();
const handle = (fn) => async (req, res) => {
  try {
    res.json((await fn(req)) ?? { success: true });
  } catch (error) {
    if (!error.status)
      console.error("Commerce request failed:", error.code || error.message);
    res.status(error.status || 500).json({
      ...(error.code==='FEATURE_MAINTENANCE'?{code:error.code}:{}),
      message: error.status
        ? error.message
        : "Не удалось выполнить операцию. Попробуйте ещё раз.",
    });
  }
};
router.get(
  "/catalog",
  requirePlatformFeature('market'),
  handle(() => service.catalog()),
);
router.get(
  "/listings",
  requirePlatformFeature('market'),
  handle((req) => service.listings(req.query)),
);
router.get("/escrow/policy", handle(() => service.escrowFeePolicy()));
router.use(auth);
const retiredMarket = (_req,res) => res.status(410).json({
  code:'MARKET_USDT_ONLY',
  message:'Операции маркета доступны в USDT на /market',
});

// Resolve the deal's actual kind on the server, never a client-supplied flag.
router.use('/deals/:id',async(req,res,next)=>{
  try {
    const details=await service.dealDetails(req.user.userId,req.params.id);
    if(details.deal.kind!=='MARKET')await assertAccountFeature(req.user.userId,'guarantor');
    await assertPlatformFeature(details.deal.kind==='MARKET'?'market':'guarantor',await service.isCommerceAdmin(req.user.userId));
    next();
  }catch(error){res.status(error.status||500).json({code:error.code,message:error.status?error.message:'Не удалось проверить доступность сделки'});}
});
const mutations = createRateLimit({
  windowMs: 60_000,
  max: 40,
  message: "Слишком много операций. Подождите минуту.",
});
router.use((req, res, next) =>
  req.method === "GET" ? next() : mutations(req, res, next),
);
router.get(
  "/me",
  handle((req) => service.dashboard(req.user.userId)),
);
router.get('/market-usdt', (req,res,next)=>{res.set('Cache-Control','no-store');next();},
  handle(async req=>({balances:await marketUsdtBalances(req.user.userId),transfers:await marketUsdtTransfers(req.user.userId)})));
router.post('/market-usdt',handle(async req=>{
  if(req.body?.direction==='TO_MARKET')await assertPlatformFeature('market');
  return transferMarketUsdt(req.user.userId,req.body);
}));
router.post(['/listings','/purchase','/payments'],retiredMarket);
router.patch('/listings/:id',retiredMarket);
router.post(
  "/escrow",
  requireAccountFeature('guarantor'),
  requirePlatformFeature('guarantor'),
  handle((req) => service.createEscrow(req.user.userId, req.body)),
);
router.post(
  "/deals/:id/join",
  handle((req) => service.joinEscrow(req.user.userId, req.params.id)),
);
router.get(
  "/deals/:id",
  handle((req) => service.dealDetails(req.user.userId, req.params.id)),
);
router.post(
  "/deals/:id/action",
  handle((req) => service.actOnDeal(req.user.userId, req.params.id, req.body)),
);
router.post(
  "/deals/:id/messages",
  handle((req) =>
    service.sendMessage(req.user.userId, req.params.id, req.body.text),
  ),
);
const attachmentLimit=createRateLimit({windowMs:60_000,max:8,message:'Подождите перед следующей загрузкой.'});
const readAttachment=express.raw({type:'application/octet-stream',limit:maxEscrowAttachmentSize+8196,inflate:false});
let uploadingAttachment=false;
function reserveUpload(_req,res,next){
  if(uploadingAttachment)return res.status(503).json({message:'Другое вложение обрабатывается. Попробуйте через несколько секунд.'});
  uploadingAttachment=true;
  const release=()=>{uploadingAttachment=false;res.off('finish',release);res.off('close',release);};
  res.once('finish',release);
  res.once('close',release);
  next();
}
router.post('/deals/:id/attachments',attachmentLimit,reserveUpload,
  (req,res,next)=>readAttachment(req,res,error=>{
    if(error)return res.status(error.status===413?413:400).json({message:error.status===413?'Максимальный размер файла - 20 МБ':'Не удалось прочитать вложение'});
    next();
  }),
  handle(req=>{
    const body=req.body;
    if(!Buffer.isBuffer(body)||body.length<5)throw Object.assign(new Error('Выберите непустой файл'),{status:400});
    const length=body.readUInt32BE(0);
    let metadata;
    try{
      if(length>8192||length>=body.length-4)throw new Error();
      metadata=JSON.parse(body.toString('utf8',4,4+length));
      if(typeof metadata?.name!=='string'||typeof metadata.caption!=='string')throw new Error();
    }catch{
      throw Object.assign(new Error('Не удалось прочитать вложение'),{status:400});
    }
    return service.sendEscrowAttachment(req.user.userId,req.params.id,{
      buffer:body.subarray(4+length),name:metadata.name,caption:metadata.caption,
    });
  }));
router.get('/deals/:id/attachments/:attachmentId',async(req,res)=>{
  try{
    const attachment=await service.getEscrowAttachment(req.user.userId,req.params.id,req.params.attachmentId);
    res.attachment(attachment.filename);
    res.set({'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});
    res.sendFile(escrowAttachmentPath(req.params.attachmentId),error=>{
      if(error&&!res.headersSent)res.sendStatus(error.statusCode||500);
      else if(error)res.destroy();
    });
  }catch(error){
    res.status(error.status||500).json({message:error.status?error.message:'Не удалось открыть вложение'});
  }
});
router.use("/admin", async (req, res, next) => {
  try {
    if (!(await service.isCommerceAdmin(req.user.userId)))
      return res
        .status(403)
        .json({ message: "Требуется доступ администратора" });
    next();
  } catch {
    res.status(500).json({ message: "Не удалось проверить доступ" });
  }
});
router.get(
  "/admin",
  handle(() => service.adminOverview()),
);
router.get('/admin/escrow', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, handle(req => escrowAdminList(req.query, req.user.userId)));
router.get('/admin/escrow/policy', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, handle(() => service.adminEscrowFeePolicy()));
router.patch('/admin/escrow/policy', handle(req => service.updateEscrowFeePolicy(req.user.userId, req.body?.feePercent, req.body?.minimumAmount)));
router.post('/admin/deals/:id/read', handle(req => service.markEscrowMessagesRead(req.user.userId, req.params.id)));
router.patch('/admin/listings/:id',retiredMarket);
router.post(
  "/admin/deals/:id/action",
  handle((req) =>
    service.actOnDeal(req.user.userId, req.params.id, req.body, true),
  ),
);
router.post('/admin/payments/:id',retiredMarket);
export default router;
