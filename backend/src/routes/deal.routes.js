import express from "express";
import { hasStaffPermission } from '../services/staff-access.service.js';
import {db} from "../config/db.js";
import { reserveUsdt, consumeUsdtReservation, releaseUsdtReservation } from "../services/wallet-reservation.service.js";
import { applyP2pCommission, calculateP2pSettlement, getP2pFeePolicy } from "../services/p2p-fee.service.js";

const router = express.Router();

const safeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const parsePaymentMethods = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    return [];
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAdminEmails = () => {
    return String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
        .split(/[,;\n]/)
        .map(normalizeEmail)
        .filter(Boolean);
};

const requireAdmin = async (req, res, next) => {
    try {
        if(await hasStaffPermission(req.user.userId,'p2p'))return next();
        return res.status(403).json({message:'Недостаточно прав на просмотр P2P'});
    } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ message: 'Failed to check admin access' });
    }
};

const isAdminUser = async (userId, executor = db) => {
    const adminEmails = getAdminEmails();

    if (adminEmails.length === 0) {
        return false;
    }

    const [rows] = await executor.execute(
        `SELECT email FROM users WHERE id = ?`,
        [userId]
    );

    return adminEmails.includes(normalizeEmail(rows[0]?.email));
};

const canAccessDealRow = async (deal, userId, executor = db) => {
    if (deal.buyer_id === userId || deal.seller_id === userId) {
        return true;
    }

    return hasStaffPermission(userId, 'p2p', executor);
};

const formatDeal = (row) => {
    const p2pGrossAmount = row.crypto_amount || row.order_amount || 0;
    const p2pSettlement = calculateP2pSettlement(p2pGrossAmount, row.p2p_fee_percent || 0);
    return {
    ...row,
    p2p_fee_amount: p2pSettlement.feeAmount,
    p2p_net_amount: p2pSettlement.netAmount,
    buyer: {
        id: row.buyer_id,
        username: row.buyer_username,
        email: row.buyer_email
    },
    seller: {
        id: row.seller_id,
        username: row.seller_username,
        email: row.seller_email
    },
    order: {
        id: row.order_id,
        type: row.order_type,
        amount: row.order_amount,
        available_amount: Math.max(safeNumber(row.order_amount) - safeNumber(row.order_filled_amount), 0),
        price: row.order_price,
        min_limit: row.order_min_limit,
        max_limit: row.order_max_limit,
        createdAt: row.order_created_at,
        payment_methods: parsePaymentMethods(row.order_payment_methods ?? row.payment_methods)
    }
    };
};

const dealSelect = `
    SELECT d.*,
           o.type AS order_type,
           o.amount AS order_amount,
           o.filled_amount AS order_filled_amount,
           o.price AS order_price,
           o.min_limit AS order_min_limit,
           o.max_limit AS order_max_limit,
           o.payment_methods AS order_payment_methods,
           o.created_at AS order_created_at,
           u_buyer.username AS buyer_username,
           u_buyer.email AS buyer_email,
           u_seller.username AS seller_username,
           u_seller.email AS seller_email
    FROM deals d
    JOIN orders o ON d.order_id = o.id
    JOIN users u_buyer ON d.buyer_id = u_buyer.id
    JOIN users u_seller ON d.seller_id = u_seller.id
`;

router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const orderId = Number(req.body?.orderId);
        const requestedCryptoAmount = safeNumber(req.body?.cryptoAmount);
        const requestedFiatAmount = safeNumber(req.body?.fiatAmount);
        const paymentMethod = String(req.body?.paymentMethod || "").trim();
        const uid = req.user.userId;

        const [controlRows] = await connection.execute(
            `SELECT COALESCE(status, 'active') AS status, COALESCE(p2p_enabled, 1) AS p2p_enabled FROM users WHERE id = ?`,
            [uid]
        );

        if (controlRows[0]?.status === 'blocked' || Number(controlRows[0]?.p2p_enabled) !== 1) {
            await connection.rollback();
            return res.status(403).json({ message: 'P2P is disabled for this account' });
        }

        if (!Number.isFinite(orderId) || orderId <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Invalid order id' });
        }

        const [orderRows] = await connection.execute(
            `SELECT * FROM orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );

        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Order not found' });
        }

        const order = orderRows[0];
        if (order.user_id === uid) {
            await connection.rollback();
            return res.status(400).json({ message: 'You cannot create a deal from your own order' });
        }

        if (order.status && order.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ message: 'Order is not active' });
        }

        const price = safeNumber(order.price);
        const maxOrderCryptoAmount = Math.max(
            safeNumber(order.amount) - safeNumber(order.filled_amount),
            0,
        );
        const cryptoAmount = requestedCryptoAmount > 0
            ? requestedCryptoAmount
            : requestedFiatAmount > 0 && price > 0
                ? requestedFiatAmount / price
                : 0;
        const fiatAmount = requestedFiatAmount > 0 ? requestedFiatAmount : cryptoAmount * price;
        const minLimit = safeNumber(order.min_limit);
        const maxLimit = safeNumber(order.max_limit) || maxOrderCryptoAmount * price;
        const allowedPaymentMethods = parsePaymentMethods(order.payment_methods);

        if (price <= 0 || cryptoAmount <= 0 || fiatAmount <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Invalid deal amount' });
        }

        if (cryptoAmount > maxOrderCryptoAmount) {
            await connection.rollback();
            return res.status(400).json({ message: 'Deal amount is greater than order amount' });
        }

        if (fiatAmount < minLimit || fiatAmount > maxLimit) {
            await connection.rollback();
            return res.status(400).json({ message: 'Deal amount is outside order limits' });
        }

        if (allowedPaymentMethods.length > 0 && !allowedPaymentMethods.includes(paymentMethod)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Payment method is not available for this order' });
        }

        let buyerId, sellerId;

        if (order.type === 'SELL') {
            buyerId = uid;
            sellerId = order.user_id;
        } else {
            buyerId = order.user_id;
            sellerId = uid;
        }

        const [[feePolicy]] = await connection.execute(
            "SELECT p2p_fee_percent FROM commerce_policy WHERE id=1 FOR UPDATE"
        );
        if (!feePolicy) throw Object.assign(new Error('Настройки комиссии P2P не найдены'), { status: 503 });
        await reserveUsdt(connection, sellerId, cryptoAmount);

        const [result] = await connection.execute(
            `INSERT INTO deals (order_id, buyer_id, seller_id, crypto_amount, fiat_amount, price, payment_method, expires_at, crypto_locked, p2p_fee_percent)
             VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), 1, ?)`,
            [order.id, buyerId, sellerId, cryptoAmount, fiatAmount, price, paymentMethod || allowedPaymentMethods[0] || 'bank', feePolicy.p2p_fee_percent]
        );

        await connection.execute(
            `UPDATE orders
             SET filled_amount = COALESCE(filled_amount, 0) + ?,
                 status = CASE WHEN COALESCE(filled_amount, 0) + ? >= amount THEN 'completed' ELSE status END,
                 updated_at = NOW()
             WHERE id = ?`,
            [cryptoAmount, cryptoAmount, order.id]
        );

        await connection.commit();

        const [dealRows] = await db.execute(
            `${dealSelect} WHERE d.id = ?`,
            [result.insertId]
        );

        res.status(201).json(formatDeal(dealRows[0]));
    } catch (err) {
        await connection.rollback();
        console.error('POST /deal error:', err);
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to create deal' });
    } finally {
        connection.release();
    }
});

router.get('/my-deals',  async (req, res) => {
    try {
        const uid = req.user.userId;

        const [rows] = await db.execute(
            `${dealSelect}
             WHERE d.buyer_id = ? OR d.seller_id = ?
             ORDER BY d.created_at DESC`,
            [uid, uid]
        );

        const formattedDeals = rows.map(formatDeal);

        res.json(formattedDeals);
    } catch (err) {
        console.error('GET /deal/my-deals error:', err);
        res.status(500).json({ message: 'Failed to fetch deals' });
    }
});

router.get('/admin/all', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(`${dealSelect} ORDER BY d.created_at DESC`);

        const formattedDeals = rows.map(formatDeal);

        res.json(formattedDeals);
    } catch (err) {
        console.error('GET /deal/admin/all error:', err);
        res.status(500).json({ message: 'Failed to fetch all deals' });
    }
});

router.get('/fee-policy', async (_req, res) => {
    try {
        res.set('Cache-Control', 'no-store').json(await getP2pFeePolicy());
    } catch (error) {
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось загрузить комиссию P2P' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: 'Invalid deal id' });
        }

        const [rows] = await db.execute(
            `${dealSelect} WHERE d.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Deal not found' });
        }

        const row = rows[0];

        const allowed = await canAccessDealRow(row, req.user.userId);
        if (!allowed) {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json(formatDeal(row));
    } catch (err) {
        console.error('GET /deal/:id error:', err);
        res.status(500).json({ message: 'Failed to fetch deal' });
    }
});

router.patch('/:id/status', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const id = Number(req.params.id);
        const { status } = req.body || {};
        const cancelReason = String(req.body?.cancelReason || "").trim();
        const allowed = ['PAYMENT_CONFIRMED', 'COMPLETED', 'CANCELLED', 'DISPUTE'];

        if (!allowed.includes(status)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Invalid status' });
        }

        const [dealRows] = await connection.execute(
            `SELECT d.*, o.amount AS order_amount, o.user_id AS order_user_id, o.type AS order_type
       FROM deals d
       JOIN orders o ON d.order_id = o.id
       WHERE d.id = ? FOR UPDATE`,
            [id]
        );


        if (dealRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Deal not found' });
        }

        const deal = dealRows[0];
        const grossAmount = String(deal.crypto_amount || deal.order_amount);
        const dealCryptoAmount = safeNumber(deal.crypto_amount) > 0
            ? safeNumber(deal.crypto_amount)
            : safeNumber(deal.order_amount);
        const userId = req.user.userId;
        const isBuyer = deal.buyer_id === userId;
        const isSeller = deal.seller_id === userId;
        const isAdmin = await isAdminUser(userId, connection);

        if (!isBuyer && !isSeller && !isAdmin) {
            await connection.rollback();
            return res.status(403).json({ message: 'Access denied' });
        }

        if (status === 'PAYMENT_CONFIRMED' && !isBuyer && !isAdmin) {
            await connection.rollback();
            return res.status(403).json({ message: 'Only buyer can confirm payment' });
        }

        if (status === 'COMPLETED' && !isSeller && !isAdmin) {
            await connection.rollback();
            return res.status(403).json({ message: 'Only seller can complete deal' });
        }

        if (status === 'DISPUTE' && !isBuyer && !isSeller && !isAdmin) {
            await connection.rollback();
            return res.status(403).json({ message: 'Only deal participants can open dispute' });
        }

        if (['COMPLETED', 'CANCELLED'].includes(deal.status)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Deal is already closed' });
        }

        if (status === 'PAYMENT_CONFIRMED' && deal.status !== 'AWAITING_PAYMENT') {
            await connection.rollback();
            return res.status(400).json({ message: 'Payment can be confirmed only for awaiting deals' });
        }

        if (status === 'COMPLETED' && !['PAYMENT_CONFIRMED', 'DISPUTE'].includes(deal.status)) {
            await connection.rollback();
            return res.status(400).json({ message: 'Deal can be completed only after payment confirmation' });
        }

        const cryptoSenderId = deal.seller_id;
        const cryptoReceiverId = deal.buyer_id;

        const [[lockedSenderWallet]] = await connection.execute(
            `SELECT * FROM wallets WHERE user_id = ? AND currency = 'USDT' FOR UPDATE`,
            [cryptoSenderId]
        );

        if (!lockedSenderWallet) {
            await connection.rollback();
            return res.status(400).json({ message: 'Sender wallet not found' });
        }


        let transferred = deal.transferred;

        if (status === 'PAYMENT_CONFIRMED' && !transferred && !deal.crypto_locked) {
            if (Number(lockedSenderWallet.balance) < dealCryptoAmount) {
                await connection.rollback();
                return res.status(400).json({ message: 'Insufficient crypto balance' });
            }
        }

        if (status === 'COMPLETED' && !transferred) {

            const [[receiverUser]] = await connection.execute(
                `SELECT email FROM users WHERE id = ?`,
                [cryptoReceiverId]
            );

            if (!receiverUser) {
                await connection.rollback();
                return res.status(400).json({ message: 'Receiver user not found' });
            }


            if (deal.crypto_locked) {
                await consumeUsdtReservation(connection, cryptoSenderId, grossAmount);
            } else {
                const [debit] = await connection.execute(
                    `UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND currency = 'USDT' AND balance >= ?`,
                    [grossAmount, cryptoSenderId, grossAmount]
                );
                if (debit.affectedRows !== 1) {
                    await connection.rollback();
                    return res.status(409).json({ message: 'Insufficient crypto balance' });
                }
            }

            const settlement = await applyP2pCommission(connection, {
                dealId: id,
                sellerId: cryptoSenderId,
                beneficiaryId: cryptoReceiverId,
                grossAmount,
                feePercent: deal.p2p_fee_percent || 0,
            });
            const [credit] = await connection.execute(
                `UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = 'USDT'`,
                [settlement.netAmount, cryptoReceiverId]
            );
            if (credit.affectedRows !== 1) throw new Error('Receiver USDT wallet not found');


            await connection.execute(
                `INSERT INTO transactions 
         (wallet_id, tx_hash, from_address, to_address, amount, currency, type)
         VALUES (?, ?, ?, ?, ?, 'USDT', 'internal')`,
                [
                    lockedSenderWallet.id,
                    `deal-${id}-completed`,
                    lockedSenderWallet.address,
                    receiverUser.email,
                    settlement.netAmount
                ]
            );

            transferred = true;
        }

        if (status === 'CANCELLED' && !transferred && deal.crypto_locked) {
            await releaseUsdtReservation(connection, cryptoSenderId, grossAmount);

            await connection.execute(
                `UPDATE orders
                 SET filled_amount = GREATEST(COALESCE(filled_amount, 0) - ?, 0),
                     status = 'pending',
                     updated_at = NOW()
                 WHERE id = ?`,
                [dealCryptoAmount, deal.order_id]
            );
        }

        await connection.execute(
            `UPDATE deals
             SET status = ?,
                 transferred = ?,
                 cancel_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancel_reason END,
                 paid_at = CASE WHEN ? = 'PAYMENT_CONFIRMED' THEN NOW() ELSE paid_at END,
                 completed_at = CASE WHEN ? = 'COMPLETED' THEN NOW() ELSE completed_at END,
                 cancelled_at = CASE WHEN ? = 'CANCELLED' THEN NOW() ELSE cancelled_at END
             WHERE id = ?`,
            [status, transferred, status, cancelReason || 'Не указана', status, status, status, id]
        );

        await connection.commit();

        const [updatedDealRows] = await connection.execute(
            `${dealSelect} WHERE d.id = ?`,
            [id]
        );

        res.json(formatDeal(updatedDealRows[0]));

    } catch (err) {
        await connection.rollback();
        console.error('PATCH /deal/:id/status error:', err);
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to update deal status' });
    } finally {
        connection.release();
    }
});




export default router;
