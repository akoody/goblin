import express from "express";
import jwt from "jsonwebtoken";
import { db } from "../../config/db.js";

const router = express.Router();

router.get("/me", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ message: "No token provided" });


    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, "dev-secret");
        const userId = decoded.userId;

        const [userRows] = await db.query("SELECT id, username, email, created_at FROM users WHERE id = ?", [userId]);
        if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

        const [walletRows] = await db.query(
            "SELECT currency, balance, COALESCE(locked_balance, 0) AS locked_balance, address FROM wallets WHERE user_id = ?",
            [userId]
        );

        userRows[0].wallets = walletRows;
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

router.delete("/me", async (req, res) => {
    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
        const userId = Number(req.user?.userId || 0);

        if (!Number.isFinite(userId) || userId <= 0) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await connection.beginTransaction();
        transactionStarted = true;

        const [users] = await connection.execute(
            "SELECT id, status FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
            [userId]
        );

        if (users.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ message: "User not found" });
        }

        await connection.execute(
            `UPDATE users
             SET status = 'deleted',
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
