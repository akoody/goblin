import express from "express";
import { staffAccess, helperRoutePermission } from "../services/staff-access.service.js";
import registerStaff from "./admin/staff.js";
import registerTreasury from "./admin/treasury.js";
import registerReferrals from "./admin/referrals.js";
import registerLoginIps from "./admin/login-ips.js";
import registerFeatures from "./admin/features.js";
import registerDeals from "./admin/deals.js";
import registerUsers from "./admin/users.js";
import registerTransactions from "./admin/transactions.js";
import registerTrading from "./admin/trading.js";
import registerProcessing from "./admin/processing.js";
import registerIncomeReport from "./admin/income-report.js";

// Админка. Права проверяет requireAdmin: админ видит всё, хелпер только разрешённые ему маршруты.
// Сами маршруты разложены по разделам в routes/admin/; порядок подключения сохраняет порядок маршрутов.
const router = express.Router();

const requireAdmin = async (req, res, next) => {
  try {
    const access=await staffAccess(req.user.userId);
    req.staffAccess=access;
    if(access.role==='admin')return next();
    const permission=helperRoutePermission(req.method,req.path);
    if(access.role==='helper'&&permission&&access.permissions.includes(permission))return next();
    return res.status(403).json({message:'Недостаточно прав'});
  } catch (err) {
    console.error("Admin access check error:", err);
    res.status(500).json({ message: "Failed to check admin access" });
  }
};

router.get('/access',async(req,res)=>{try{res.set('Cache-Control','no-store').json(await staffAccess(req.user.userId));}catch{res.status(500).json({message:'Не удалось проверить права'});}});
router.use(requireAdmin);

registerStaff(router);
registerTreasury(router);
registerReferrals(router);
registerLoginIps(router);
registerFeatures(router);
registerDeals(router);
registerUsers(router);
registerTransactions(router);
registerTrading(router);
registerProcessing(router);
registerIncomeReport(router);

export default router;
