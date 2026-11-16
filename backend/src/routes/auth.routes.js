import express from "express";
import { completeLogin, loginUser, registerUserWithReferral } from "../services/auth.service.js";
import { confirmPasswordReset, requestPasswordReset } from "../services/password-reset.service.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { setMarketCookie } from '../services/market-session.service.js';
import { verifyAccessToken } from '../config/jwt.js';

const router = express.Router();
const loginLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Слишком много попыток входа. Попробуйте позже." });
const resetRequestLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 3, message: "Слишком много запросов кода. Попробуйте позже." });
const resetConfirmLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Слишком много попыток. Запросите новый код позже." });
const registrationLimit = createRateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: "Слишком много попыток регистрации. Попробуйте позже." });

router.post("/login", loginLimit, async (req, res) => {
    const {username,password,challenge,code,deviceModel}=req.body??{};
    res.set("Cache-Control","no-store");
    const context={ip:req.ip,userAgent:req.get("user-agent"),deviceModel};
    try {
        let result;
        if(challenge!==undefined){
            result=await completeLogin(challenge,code,context);
        }else{
            if(typeof username!=="string"||!username.trim()||username.length>254||
               typeof password!=="string"||!password){
                return res.status(400).json({message:"Введите логин или email и пароль."});
            }
            result=await loginUser(username.trim(),password,context);
        }
        if(result.challenge)return res.status(202).json({requiresAuthenticator:true,challenge:result.challenge});
        setMarketCookie(res,result.token,verifyAccessToken(result.token).exp,req.secure);
        return res.json({success:true,access_token:result.token});
    }catch(error){
        if(error.status)return res.status(error.status).json({success:false,code:error.code,message:error.message});
        console.error("Login failed",error.code||error.name);
        return res.status(503).json({success:false,message:"Вход временно недоступен. Попробуйте позже."});
    }
});

router.post("/password-reset/request", resetRequestLimit, async (req, res) => {
    try {
        await requestPasswordReset(req.body?.identifier);
        res.json({
            success: true,
            message: "Если аккаунт найден, код восстановления отправлен на его почту.",
        });
    } catch (error) {
        console.error("Password reset email failed:", error.message);
        res.status(503).json({ message: "Не удалось отправить код. Попробуйте позже." });
    }
});

router.post("/password-reset/confirm", resetConfirmLimit, async (req, res) => {
    const { identifier, code, password } = req.body || {};

    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Пароль должен содержать минимум 8 символов." });
    }

    try {
        await confirmPasswordReset(identifier, code, password);
        res.json({ success: true, message: "Пароль изменён. Теперь можно войти." });
    } catch (error) {
        if (error.message === "Invalid or expired reset code") {
            return res.status(400).json({ message: "Неверный или просроченный код." });
        }
        console.error("Password reset confirmation failed:", error);
        res.status(500).json({ message: "Не удалось изменить пароль. Попробуйте позже." });
    }
});


router.post("/register", registrationLimit, async (req, res) => {
    const { username, email, password, referralCode } = req.body;
    if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return res.status(400).json({message:'Укажите действующую почту, например name@mail.ru'});
    if(typeof password!=='string'||password.length<10||Buffer.byteLength(password,'utf8')>72||!/[A-Za-zА-Яа-я]/.test(password)||!/[0-9]/.test(password))return res.status(400).json({message:'Пароль: минимум 10 символов, буквы и цифры; максимум 72 байта'});


    if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
    }

    try {
        const id = await registerUserWithReferral(username, email.trim().toLowerCase(), password, referralCode);
        res.json({ success: true, user_id: id });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});



export default router;
