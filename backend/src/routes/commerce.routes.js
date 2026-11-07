import express from "express";
import {assertAccountFeature,requireAccountFeature} from '../middleware/account-feature.js';
import { auth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import * as service from "../services/commerce.service.js";
import { escrowAdminList } from '../services/escrow-admin.service.js';
import { requirePlatformFeature, assertPlatformFeature } from '../services/platform-features.service.js';

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
router.post(
  "/listings",
  requirePlatformFeature('market'),
  handle((req) => service.createListing(req.user.userId, req.body)),
);
router.patch(
  "/listings/:id",
  requirePlatformFeature('market'),
  handle((req) =>
    service.setListingStatus(req.user.userId, req.params.id, req.body.status),
  ),
);
router.post(
  "/purchase",
  requirePlatformFeature('market'),
  handle((req) => service.purchase(req.user.userId, req.body)),
);
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
router.post(
  "/payments",
  requirePlatformFeature('market'),
  handle((req) => service.requestPayment(req.user.userId, req.body)),
);
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
router.patch(
  "/admin/listings/:id",
  handle((req) =>
    service.setListingStatus(
      req.user.userId,
      req.params.id,
      req.body.status,
      true,
    ),
  ),
);
router.post(
  "/admin/deals/:id/action",
  handle((req) =>
    service.actOnDeal(req.user.userId, req.params.id, req.body, true),
  ),
);
router.post(
  "/admin/payments/:id",
  handle((req) =>
    service.reviewPayment(req.user.userId, req.params.id, req.body),
  ),
);
export default router;
