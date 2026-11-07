import express from "express";
import {transactionHistory} from '../../services/transaction-history.service.js';
import {nativeAmount} from '../../services/native-chain-policy.js';
import {createRateLimit} from '../../middleware/rate-limit.js';
import {quoteNativeWithdrawal,executeNativePlan,nativePlan} from '../../services/native-chain.service.js';
import {walletAssets} from '../../services/wallet-assets.service.js';
import { db } from "../../config/db.js";
import { send } from "../../services/transactions.service.js";
import {
    externalWalletProcessing,
    getWalletNetwork,
} from "../../config/wallet-networks.js";


const router = express.Router();
const nativeHandler=work=>async(req,res)=>{try{res.set('Cache-Control','no-store').json(await work(req));}catch(e){res.status(e.status||503).json({message:e.status?e.message:'Сеть временно недоступна; средства не списаны',code:e.code||'NATIVE_UNAVAILABLE'});}};
router.post('/native/quote',createRateLimit({windowMs:60000,max:15,message:'Подождите перед следующим расчётом вывода'}),nativeHandler(req=>quoteNativeWithdrawal(req.user.userId,req.body.currency,req.body.address,req.body.amount,req.body.requestKey)));
router.post('/native/:id/execute',nativeHandler(req=>executeNativePlan(req.params.id,req.user.userId)));
router.get('/native/:id',nativeHandler(req=>nativePlan(req.params.id,req.user.userId)));
router.get('/assets',async(req,res)=>{
 if(!req.user?.userId)return res.sendStatus(401);
 try{res.set('Cache-Control','no-store').json(await walletAssets(req.user.userId));}
 catch{res.status(503).json({message:'Не удалось загрузить активы кошелька'});}
});

router.get('/statement', async (req,res) => {
  try { res.set('Cache-Control','no-store').json(await transactionHistory(req.query,{userId:req.user.userId})); }
  catch(e) { res.status(e.status||500).json({message:e.status?e.message:'Не удалось загрузить историю'}); }
});

router.get('/history', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }


        const [rows] = await db.execute(
            `SELECT DISTINCT
                 t.*,
                 sender.email AS senderEmail,
                 receiver.email AS recipientEmail,
                 CASE
                     WHEN t.from_address IN (SELECT address FROM wallets WHERE user_id = ?)
                         THEN 'OUT'
                     ELSE 'IN'
                     END AS direction,
                 CASE
                     WHEN t.from_address IN (SELECT address FROM wallets)
                         AND (t.to_address IN (SELECT address FROM wallets)
                             OR t.to_address IN (SELECT email FROM users))
                         THEN 'INTERNAL'
                     ELSE 'EXTERNAL'
                     END AS type
             FROM transactions t
                      LEFT JOIN wallets w_sender ON t.from_address = w_sender.address
                      LEFT JOIN users sender ON w_sender.user_id = sender.id
                      LEFT JOIN wallets w_receiver ON t.wallet_id = w_receiver.id
                      LEFT JOIN users receiver ON w_receiver.user_id = receiver.id
             WHERE t.from_address IN (SELECT address FROM wallets WHERE user_id = ?)
                OR t.wallet_id IN (SELECT id FROM wallets WHERE user_id = ?)
                OR t.to_address = (SELECT email FROM users WHERE id = ?);`,
            [userId, userId, userId, userId]
        );

        // Отправляем результат клиенту
        res.json(rows);
    } catch (err) {
        console.error('Ошибка при получении истории транзакций:', err);
        res.status(500).json({ message: 'Не удалось получить историю транзакций' });
    }
});

router.get('/transactions', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const [rows] = await db.execute(
            `SELECT DISTINCT
                 t.*,
                 sender.email AS senderEmail,
                 receiver.email AS recipientEmail,
                 CASE
                     WHEN t.from_address IN (SELECT address FROM wallets WHERE user_id = ?)
                         THEN 'OUT'
                     ELSE 'IN'
                     END AS direction,
                 CASE
                     WHEN t.from_address IN (SELECT address FROM wallets)
                         AND (t.to_address IN (SELECT address FROM wallets)
                             OR t.to_address IN (SELECT email FROM users))
                         THEN 'INTERNAL'
                     ELSE 'EXTERNAL'
                     END AS type
             FROM transactions t
                      LEFT JOIN wallets w_sender ON t.from_address = w_sender.address
                      LEFT JOIN users sender ON w_sender.user_id = sender.id
                      LEFT JOIN wallets w_receiver ON t.wallet_id = w_receiver.id
                      LEFT JOIN users receiver ON w_receiver.user_id = receiver.id
             WHERE t.from_address IN (SELECT address FROM wallets WHERE user_id = ?)
                OR t.wallet_id IN (SELECT id FROM wallets WHERE user_id = ?)
                OR t.to_address = (SELECT email FROM users WHERE id = ?)
             ORDER BY t.created_at DESC;`,
            [userId, userId, userId, userId]
        );

        const [withdrawals] = await db.execute(
            `SELECT cw.id, cw.tx_hash, w.address AS from_address, cw.to_address,
                    cw.amount, cw.currency, cw.status, cw.created_at
             FROM crypto_withdrawals cw
             INNER JOIN wallets w ON w.id = cw.wallet_id
             WHERE cw.user_id = ?
             ORDER BY cw.created_at DESC`,
            [userId]
        );

        const [unscreened]=await db.execute("SELECT d.tx_hash,d.wallet_id FROM blockchain_deposits d JOIN deposit_reviews r ON r.deposit_id=d.id JOIN wallets w ON w.id=d.wallet_id WHERE w.user_id=? AND d.currency='BTC' AND d.credited_at IS NOT NULL AND r.risk_level='NOT_SCREENED'",[userId]);
        const notChecked=new Set(unscreened.map(d=>`${d.wallet_id}:${d.tx_hash}`));
        const completedTransactions = rows.map((row) => ({
            ...row,
            createdAt: row.created_at,
            senderAddress: row.from_address,
            receiverAddress: row.to_address,
            amlNotChecked:notChecked.has(`${row.wallet_id}:${row.tx_hash}`),
        }));
        const withdrawalTransactions = withdrawals.map((withdrawal) => ({
            id: `withdrawal-${withdrawal.id}`,
            tx_hash: withdrawal.tx_hash,
            from_address: withdrawal.from_address,
            to_address: withdrawal.to_address,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            direction: 'OUT',
            type: 'EXTERNAL',
            status: withdrawal.status,
            created_at: withdrawal.created_at,
            createdAt: withdrawal.created_at,
            senderAddress: withdrawal.from_address,
            receiverAddress: withdrawal.to_address,
        }));
        const [pendingDeposits]=await db.execute(`SELECT d.*,r.status,r.fee_amount,r.net_amount FROM deposit_reviews r JOIN blockchain_deposits d ON d.id=r.deposit_id JOIN wallets w ON w.id=d.wallet_id WHERE w.user_id=? AND r.status<>'CREDITED' ORDER BY r.created_at DESC LIMIT 200`,[userId]);
        const pendingTransactions=pendingDeposits.map(d=>({id:'deposit-review-'+d.id,tx_hash:d.tx_hash,amount:d.amount,currency:d.currency,from_address:d.from_address,to_address:d.to_address,direction:'IN',type:'EXTERNAL',status:d.status,createdAt:new Date(Number(d.block_timestamp)).toISOString(),senderAddress:d.from_address,receiverAddress:d.to_address}));

        const [nativeRows]=await db.execute("SELECT id,currency,status,tx_hash,plan_json,created_at FROM native_chain_jobs WHERE user_id=? AND kind='withdrawal' AND status IN ('prepared','submitted','review','failed') ORDER BY created_at DESC LIMIT 100",[userId]);
        const nativeTransactions=nativeRows.map(row=>{const p=typeof row.plan_json==='string'?JSON.parse(row.plan_json):row.plan_json;return {id:'native-'+row.id,tx_hash:row.tx_hash,currency:row.currency,amount:p.amount?nativeAmount(p.amount,row.currency):'0',status:row.status,direction:'OUT',type:'EXTERNAL',from_address:p.sources[0].address,to_address:p.outputs[0].address,senderAddress:p.sources[0].address,receiverAddress:p.outputs[0].address,createdAt:row.created_at};});
        res.json([...completedTransactions, ...withdrawalTransactions,...pendingTransactions,...nativeTransactions]
            .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)));
    } catch (err) {
        console.error('Ошибка при получении истории транзакций:', err);
        res.status(500).json({ message: 'Не удалось получить историю транзакций' });
    }
});


router.get('/balance', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }


        const [rows] = await db.execute(
            `SELECT currency, balance, COALESCE(locked_balance, 0) AS locked_balance, address
             FROM wallets
             WHERE user_id=?;`, [userId]
        );

        const [nativePolicies]=await db.query('SELECT currency,deposits_enabled,withdrawals_enabled,aml_disabled FROM native_chain_policy');
        const capabilities=currency=>{
            const base=externalWalletProcessing.assets[String(currency).toUpperCase()]||{depositsEnabled:false,withdrawalsEnabled:false};
            const p=nativePolicies.find(p=>p.currency===currency);
            return p?{depositsEnabled:base.depositsEnabled&&Boolean(p.deposits_enabled),withdrawalsEnabled:base.withdrawalsEnabled&&Boolean(p.withdrawals_enabled),amlMode:currency==='BTC'?(p.aml_disabled?'DISABLED':'MANUAL'):'SAFIO',reason:currency==='BTC'?'Операции Bitcoin управляются администратором.':'Операции Ethereum отключены администратором или на сервере.'}:base;
        };
        const wallets = rows.map((row) => ({
            ...row,
            network: getWalletNetwork(row.currency),
            externalTransfers: capabilities(row.currency),
        }));

        const result = rows.reduce((acc, row) => {
            acc[row.currency] = row.balance;
            acc[`${String(row.currency).toLowerCase()}Balance`] = row.balance;
            acc[`${String(row.currency).toLowerCase()}LockedBalance`] = row.locked_balance;
            return acc;
        }, {
            wallets,
            externalTransfers: externalWalletProcessing,
        });
        const [[depositPolicy]]=await db.execute('SELECT fee_usd,min_usd FROM deposit_policy WHERE id=1');
        result.depositPolicy={feeUsd:depositPolicy.fee_usd,minUsd:depositPolicy.min_usd,amlMode:'AWAITING_PROVIDER'};

        result.generalBalance = rows.reduce((sum, row) => {
            const currency = String(row.currency).toUpperCase();
            const rate = currency === "USDT" ? 1 : currency === "TRX" ? 0.12 : currency === "BTC" ? 69000 : currency === "ETH" ? 3700 : 0;
            return sum + Number(row.balance || 0) * rate;
        }, 0);

        res.json(result);
    } catch (err) {
        console.error('Ошибка при получении баланса:', err);
        res.status(500).json({ message: 'Не удалось получить баланс' });
    }
});

router.get('/main-wallet', async (req, res) => {
    res.json({ usdtBalance: 0, trxBalance: 0 });
});


router.post('/send', async (req, res) => {
    try {
        const { address, email, amount, currency } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const recipient = address || email;

        if (!recipient || !amount || !currency) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: address, amount, currency'
            });
        }

        const type = email ? 'internal' : 'external';

        const idempotencyKey = String(req.get("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
        const transaction = await send(userId, recipient, amount, currency, type, idempotencyKey);

        res.json({
            success: true,
            transaction: transaction
        });

    } catch (err) {
        const status = Number(err.status) || 400;
        if (status >= 500 && status !== 503) {
            console.error('Ошибка при отправке транзакции:', err);
        }
        res.status(status).json({
            success: false,
            message: err.message
        });
    }
});


export default router;
