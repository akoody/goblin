// Админка: Реферальные отчёты, ставки и ссылки. Маршруты подключает routes/admin.routes.js после проверки прав.
import { referralReport, referralInvitees, issueReferralLink } from "../../services/referral-report.service.js";
import { referralCommissionPolicy, saveReferralDefault, saveReferralUserRates } from "../../services/referral-commission-policy.service.js";

const referralHandler = fn => async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await fn(req)); }
  catch (error) {
    if (!error.status) console.error('Referral admin:', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось обработать реферальные данные' });
  }
};

export default function register(router) {
router.get('/referrals',referralHandler(req=>referralReport(req.query)));
router.get('/referral-policy',referralHandler(()=>referralCommissionPolicy()));
router.patch('/referral-policy',referralHandler(req=>saveReferralDefault(req.user.userId,req.body)));
router.patch('/referral-rates',referralHandler(req=>saveReferralUserRates(req.user.userId,req.body)));
router.get('/referrals/:id/invitees',referralHandler(req=>referralInvitees(req.params.id,req.query)));
router.post('/referrals/:id/link',referralHandler(req=>issueReferralLink(req.params.id)));
}
