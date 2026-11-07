import express from "express";
import { staffAccess } from '../../services/staff-access.service.js';
import bcrypt from "bcryptjs";
import { db } from "../../config/db.js";

const router = express.Router();

router.get("/me", async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const [userRows] = await db.query("SELECT id, username, email, created_at FROM users WHERE id = ?", [userId]);
        if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

        const [walletRows] = await db.query(
            "SELECT currency, balance, COALESCE(locked_balance, 0) AS locked_balance, address FROM wallets WHERE user_id = ?",
            [userId]
        );

        userRows[0].wallets = walletRows;
        userRows[0].staffAccess = await staffAccess(userId);
        userRows[0].generalBalance = walletRows.reduce((sum, wallet) => {
            const currency = String(wallet.currency).toUpperCase();
            const rate = currency === "USDT" ? 1 : currency === "TRX" ? 0.12 : currency === "BTC" ? 69000 : currency === "ETH" ? 3700 : 0;
            return sum + Number(wallet.balance || 0) * rate;
        }, 0);
        res.status(200).json(userRows[0]);
    } catch (err) {
        console.error(err);
        res.status(401).json({ message: "Invalid token" });
    }
});

router.get("/me/stats", async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    try {
        const [rows] = await db.execute(
            `SELECT COUNT(*) AS total,
                    SUM(status = 'COMPLETED') AS completed,
                    SUM(status = 'CANCELLED') AS cancelled,
                    SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS recent
             FROM deals
             WHERE buyer_id = ? OR seller_id = ?`,
            [userId, userId]
        );
        const total = Number(rows[0]?.total || 0);
        const completed = Number(rows[0]?.completed || 0);
        const cancelled = Number(rows[0]?.cancelled || 0);
        const recent = Number(rows[0]?.recent || 0);
        const closed = completed + cancelled;
        res.json({
            total,
            completed,
            cancelled,
            recent,
            successRate: closed > 0 ? Number(((completed / closed) * 100).toFixed(1)) : 0,
        });
    } catch (error) {
        console.error("GET /api/auth/me/stats error:", error.message);
        res.status(500).json({ message: "Не удалось загрузить статистику сделок" });
    }
});

router.delete("/me", async (req, res) => {
    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
        const userId = Number(req.user?.userId || 0);
        const password = req.body?.password;

        if (!Number.isFinite(userId) || userId <= 0) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (typeof password !== "string" || password.length === 0) {
            return res.status(400).json({ message: "Введите текущий пароль для подтверждения" });
        }

        await connection.beginTransaction();
        transactionStarted = true;

        const [users] = await connection.execute(
            "SELECT id, status, password_hash FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
            [userId]
        );

        if (users.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ message: "User not found" });
        }

        if (!(await bcrypt.compare(password, users[0].password_hash))) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(400).json({ message: "Неверный пароль" });
        }

        await connection.execute(
            `UPDATE users
             SET status = 'deleted',
                 token_version = token_version + 1,
                 deposits_enabled = 0,
                 withdrawals_enabled = 0,
                 internal_transfers_enabled = 0,
                 p2p_enabled = 0
             WHERE id = ?`,
            [userId]
        );

        await connection.execute(
            `UPDATE orders
             SET status = 'cancelled'
             WHERE user_id = ?
               AND status IN ('pending', 'paused')`,
            [userId]
        );

        await connection.commit();
        transactionStarted = false;

        res.json({
            ok: true,
            status: "deleted",
            message: "Account deleted. History is preserved for administrators.",
        });
    } catch (err) {
        if (transactionStarted) {
            await connection.rollback();
        }

        console.error("DELETE /api/auth/me error:", err);
        res.status(500).json({ message: "Failed to delete account" });
    } finally {
        connection.release();
    }
});


export default router;
