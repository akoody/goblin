import express from "express";
import { auth } from "../utils/auth.middleware.js";
import {
    deposit,
    withdraw,
    transfer
} from "../services/wallet.service.js";
import { getUserWallets } from "../models/wallet.model.js";

const router = express.Router();

router.get("/status", auth, async (req, res) => {
    const wallets = await getWallets(req.user.user_id);
    res.json(wallets);
});

router.post("/deposit", auth, (req, res) => {
    res.status(403).json({message:'Ручное начисление запрещено. Депозиты учитываются только по подтверждённой блокчейн-транзакции после проверки.'});
});

router.post("/withdraw", auth, async (req, res) => {
    const { currency, amount } = req.body;

    try {
        await withdraw(req.user.user_id, currency, amount);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});

router.post("/transfer", auth, async (req, res) => {
    const { to_user, currency, amount } = req.body;

    try {
        await transfer(req.user.user_id, to_user, currency, amount);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});


export default router;
