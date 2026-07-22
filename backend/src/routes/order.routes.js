import express from "express";
import {db} from "../config/db.js";

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

const formatOrder = (row) => ({
    ...row,
    available_amount: Math.max(safeNumber(row.amount) - safeNumber(row.filled_amount), 0),
    payment_methods: parsePaymentMethods(row.payment_methods),
    user: {
        id: row.creator_id,
        username: row.creator_username,
        email: row.creator_email
    }
});

router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT o.*, u.id as creator_id, u.username as creator_username, u.email as creator_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.status = 'pending'
             ORDER BY o.created_at DESC`
        );

        const formattedRows = rows.map(formatOrder);

        res.json(formattedRows);
    } catch (err) {
        console.error('DB error:', err);
        res.status(500).json({message: 'Failed to fetch orders'});
    }
});

router.get('/my', async (req, res) => {
    try {
        const userId = req.user.userId;
        const [rows] = await db.execute(
            `SELECT o.*, u.id as creator_id, u.username as creator_username, u.email as creator_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC`,
            [userId]
        );

        res.json(rows.map(formatOrder));
    } catch (err) {
        console.error('GET /order/my error:', err);
        res.status(500).json({message: 'Failed to fetch user orders'});
    }
});

router.post('/', async (req, res) => {
    try {
        const {type} = req.body || {};
        const amount = safeNumber(req.body?.amount);
        const price = safeNumber(req.body?.price);
        const minLimit = safeNumber(req.body?.minLimit ?? req.body?.min_limit);
        const maxLimit = safeNumber(req.body?.maxLimit ?? req.body?.max_limit);
        const paymentMethods = parsePaymentMethods(req.body?.paymentMethods ?? req.body?.payment_methods);

        if (!['BUY', 'SELL'].includes(type)) {
            return res.status(400).json({message: 'Invalid type'});
        }

        if (!(Number.isFinite(amount) && amount > 0)) {
            return res.status(400).json({message: 'Invalid amount'});
        }

        if (!(Number.isFinite(price) && price > 0)) {
            return res.status(400).json({message: 'Invalid price'});
        }

        const userId = req.user.userId;
        const [controlRows] = await db.execute(
            `SELECT COALESCE(status, 'active') AS status,
                    COALESCE(p2p_enabled, 1) AS p2p_enabled
             FROM users
             WHERE id = ?`,
            [userId]
        );

        if (controlRows[0]?.status === 'blocked' || Number(controlRows[0]?.p2p_enabled) !== 1) {
            return res.status(403).json({message: 'P2P is disabled for this account'});
        }

        const total = amount * price;
        const normalizedMinLimit = minLimit > 0 ? minLimit : Math.min(total, price);
        const normalizedMaxLimit = maxLimit > 0 ? maxLimit : total;

        if (normalizedMinLimit > normalizedMaxLimit) {
            return res.status(400).json({message: 'Min limit cannot be greater than max limit'});
        }

        if (normalizedMaxLimit > total) {
            return res.status(400).json({message: 'Max limit cannot be greater than order total'});
        }

        if (paymentMethods.length === 0) {
            return res.status(400).json({message: 'Select at least one payment method'});
        }

        const placeholders = paymentMethods.map(() => "?").join(",");
        const [methodRows] = await db.execute(
            `SELECT code FROM payment_method_definitions WHERE active = 1 AND code IN (${placeholders})`,
            paymentMethods
        );
        const activeMethods = new Set(methodRows.map((row) => row.code));
        const unavailableMethods = paymentMethods.filter((method) => !activeMethods.has(method));

        if (unavailableMethods.length > 0) {
            return res.status(400).json({message: 'Some payment methods are not available'});
        }

        if (type === 'SELL') {
            const [balanceRows] = await db.execute(
                `SELECT balance, COALESCE(locked_balance, 0) AS locked_balance
                 FROM wallets
                 WHERE user_id = ?
                   AND currency = ?`,
                [userId, "USDT"]
            );

            const usdtBalance = safeNumber(balanceRows[0]?.balance);

            if (usdtBalance < amount) {
                return res.status(400).json({
                    message: `Insufficient USDT balance. Required: ${amount}, Available: ${usdtBalance}`
                });
            }
        }

        const [result] = await db.execute(
            `INSERT INTO orders (user_id, type, amount, price, min_limit, max_limit, payment_methods, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [userId, type, amount, price, normalizedMinLimit, normalizedMaxLimit, JSON.stringify(paymentMethods)]
        );

        const [orderRows] = await db.execute(
            `SELECT *
             FROM orders
             WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json(orderRows[0]);

    } catch (err) {
        console.error('POST /order error:', err);
        res.status(500).json({message: 'Failed to create order'});
    }
});


router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({message: 'Invalid order id'});
        }

        const [rows] = await db.execute(
            `SELECT o.*, u.id as creator_id, u.username as creator_username, u.email as creator_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({message: 'Order not found'});
        }

        res.json(formatOrder(rows[0]));

    } catch (err) {
        console.error('GET /order/:id error:', err);
        res.status(500).json({message: 'Failed to fetch order'});
    }

});

router.patch('/:id/status', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userId = req.user.userId;
        const status = String(req.body?.status || '').trim();

        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({message: 'Invalid order id'});
        }

        if (!['pending', 'paused', 'cancelled'].includes(status)) {
            return res.status(400).json({message: 'Invalid status'});
        }

        const [rows] = await db.execute(
            `SELECT * FROM orders WHERE id = ? AND user_id = ?`,
            [id, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({message: 'Order not found'});
        }

        await db.execute(
            `UPDATE orders SET status = ? WHERE id = ? AND user_id = ?`,
            [status, id, userId]
        );

        res.json({ ok: true, id, status });
    } catch (err) {
        console.error('PATCH /order/:id/status error:', err);
        res.status(500).json({message: 'Failed to update order status'});
    }
});


export default router;
