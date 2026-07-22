import express from "express";
import { db } from "../../config/db.js";
import { send } from "../../services/transactions.service.js";


const router = express.Router();

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

        res.json(rows.map((row) => ({
            ...row,
            createdAt: row.created_at,
            senderAddress: row.from_address,
            receiverAddress: row.to_address,
        })));
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

        const result = rows.reduce((acc, row) => {
            acc[row.currency] = row.balance;
            acc[`${String(row.currency).toLowerCase()}Balance`] = row.balance;
            acc[`${String(row.currency).toLowerCase()}LockedBalance`] = row.locked_balance;
            return acc;
        }, { wallets: rows });

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

        const transaction = await send(userId, recipient, amount, currency, type);

        res.json({
            success: true,
            transaction: transaction
        });

    } catch (err) {
        console.error('Ошибка при отправке транзакции:', err);
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
});


export default router;
