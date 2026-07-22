import express from "express";
import {db} from "../config/db.js";
import jwt from "jsonwebtoken";
import { auth } from "./../middleware/auth.js";

const router = express.Router();

router.get('/me', auth, async (req, res) => {
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

router.get('/my-deals', auth,async (req, res) => {
    try {
        const uid = req.user.userId;

        const [rows] = await db.execute(
            `SELECT d.*, o.type AS order_type, o.amount AS order_amount, o.price AS order_price
       FROM deals d
       JOIN orders o ON d.order_id = o.id
       WHERE d.buyer_id = ? OR d.seller_id = ?
       ORDER BY d.created_at DESC`,
            [uid, uid]
        );

        res.json(rows);
    } catch (err) {
        console.error('GET /my-deals error:', err);
        res.status(500).json({ message: 'Failed to fetch deals' });
    }
});






export default router;
