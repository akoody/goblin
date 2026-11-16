// Админка: Казна, кошельки сотрудников, сбор и выплаты, сети, комиссии депозитов и P2P. Маршруты подключает routes/admin.routes.js после проверки прав.
import { treasuryPayoutOverview, savePayoutPolicy, previewTreasuryPayout, executeTreasuryPayout, recheckTreasuryPayout } from "../../services/treasury-payout.service.js";
import { nativeOverview, saveNativePolicy, createNativeVaults, previewNativeCollection, executeNativePlan, recheckNativeJob } from "../../services/native-chain.service.js";
import { collectionOverview, createCollectionWallets, saveCollectionPolicy } from "../../services/treasury-collection.service.js";
import { previewCollection, queueCollection, cancelCollectionJob, recheckCollectionJob } from "../../services/collection-engine.service.js";
import { findWalletUsers, staffWalletBalances } from "../../services/staff-wallets.service.js";
import { depositComplianceOverview, updateDepositFee, reviewDeposit } from "../../services/deposit-compliance.service.js";
import { getP2pFeePolicy, updateP2pFeePolicy } from "../../services/p2p-fee.service.js";
import { getTreasuryAutoWithdrawalPolicy, updateTreasuryAutoWithdrawalPolicy } from "../../services/treasury-auto-withdrawal-policy.service.js";

const depositHandler=fn=>async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await fn(req));}
  catch(e){if(!e.status)console.error('Deposit admin:',e.message);res.status(e.status||500).json({message:e.status?e.message:'Не удалось выполнить операцию с депозитом'});}
};

export default function register(router) {
router.get('/wallet-users',depositHandler(req=>findWalletUsers(req.query.q)));
router.get('/wallet-users/:id/balances',depositHandler(req=>staffWalletBalances(req.params.id)));
router.get('/deposit-compliance',depositHandler(()=>depositComplianceOverview()));
router.get('/treasury',depositHandler(()=>treasuryPayoutOverview()));
router.patch('/treasury/:currency/policy',depositHandler(req=>savePayoutPolicy(req.user.userId,req.params.currency,req.body)));
router.post('/treasury/:currency/preview',depositHandler(req=>previewTreasuryPayout(req.params.currency,req.user.userId,req.body)));
router.post('/treasury/payouts/:id/execute',depositHandler(req=>executeTreasuryPayout(req.params.id,req.user.userId)));
router.post('/treasury/payouts/:id/recheck',depositHandler(req=>recheckTreasuryPayout(req.params.id)));
router.get('/treasury-auto-withdrawal-policy',depositHandler(()=>getTreasuryAutoWithdrawalPolicy()));
router.get('/treasury-collection',depositHandler(()=>collectionOverview()));
router.get('/native-chains',depositHandler(()=>nativeOverview()));
router.patch('/native-chains/:currency',depositHandler(req=>saveNativePolicy(req.user.userId,req.params.currency,req.body)));
router.post('/native-chains/wallets',depositHandler(req=>createNativeVaults(req.user.userId)));
router.post('/native-chains/:currency/preview',depositHandler(req=>previewNativeCollection(req.params.currency,req.user.userId,req.body.requestKey)));
router.post('/native-chains/plans/:id/execute',depositHandler(req=>executeNativePlan(req.params.id,null,req.user.userId)));
router.post('/native-chains/jobs/:id/recheck',depositHandler(req=>recheckNativeJob(req.params.id,req.user.userId)));
router.post('/treasury-collection/wallets',depositHandler(req=>createCollectionWallets(req.user.userId)));
router.patch('/treasury-collection/:network',depositHandler(req=>saveCollectionPolicy(req.user.userId,req.params.network,req.body)));
router.post('/treasury-collection/:network/preview',depositHandler(req=>previewCollection(req.params.network,req.user.userId,req.body.requestKey)));
router.post('/treasury-collection/plans/:id/execute',depositHandler(req=>queueCollection(req.params.id,req.user.userId)));
router.post('/treasury-collection/jobs/:id/cancel',depositHandler(req=>cancelCollectionJob(req.params.id,req.user.userId)));
router.post('/treasury-collection/jobs/:id/recheck',depositHandler(req=>recheckCollectionJob(req.params.id,req.user.userId)));
router.patch('/treasury-auto-withdrawal-policy',depositHandler(req=>updateTreasuryAutoWithdrawalPolicy(req.user.userId,req.body)));
router.get('/p2p-fee-policy',depositHandler(()=>getP2pFeePolicy()));
router.patch('/p2p-fee-policy',depositHandler(req=>updateP2pFeePolicy(req.user.userId,req.body?.feePercent)));
router.patch('/deposit-compliance/policy',depositHandler(req=>updateDepositFee(req.user.userId,req.body.feeUsd)));
router.post('/deposit-compliance/:id/review',depositHandler(req=>reviewDeposit(req.user.userId,req.params.id,req.body)));
}
