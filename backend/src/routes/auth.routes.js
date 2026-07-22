import express from "express";
import { loginUser, registerUserWithReferral } from "../services/auth.service.js";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/login", async (req, res) => {


    const { username, password } = req.body;

    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

    try {
        const token = await loginUser(username, password);
        res.json({ success: true, access_token: token });
    } catch (e) {
        res.status(401).json({ success: false, message: e.message });
    }
});


router.post("/register", async (req, res) => {
    const { username, email, password, referralCode } = req.body;


    if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
    }

    try {
        const id = await registerUserWithReferral(username, email, password, referralCode);
        res.json({ success: true, user_id: id });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});



export default router;
