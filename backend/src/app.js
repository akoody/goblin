import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from 'uuid';
import jwt from "jsonwebtoken";

import { auth } from "./middleware/auth.js";
import http from "http";
import {Server as SocketIOServer} from "socket.io";
import {db} from "./config/db.js";


import dealsRoutes from "./routes/deal.routes.js";
import apiTransactionRoutes from "./routes/api/transactions.routes.js";
import apiAuthRoutes from "./routes/api/auth.routes.js";
import authRoutes from "./routes/auth.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import otherRoutes from "./routes/other.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentMethodRoutes from "./routes/payment_method.routes.js";
import messageRoutes from "./routes/message.routes.js";
import supportRoutes from "./routes/support.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import exchangeRoutes from "./routes/exchange.routes.js";
import processingRoutes from "./routes/processing.routes.js";
import nftRoutes from "./routes/nft.routes.js";


const corsOptions = {
  origin: true, // принимать любой origin (отражает Origin)
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS", 'DELETE']
};

const app = express();

const server = http.createServer(app);

const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001', 'http://localhost:80', 'http://localhost:8080',
            'http://91.214.78.53',
            'http://91.214.78.53:80'];
const io = new SocketIOServer(server,{
    path: '/socket.io', // СЛЭШ НА КОНЦЕ НЕ НУЖЕН!
    cors: {
        origin: true, // принимать любой origin
        credentials: true,
        methods: ["GET", "POST", "PATCH", "OPTIONS", 'DELETE']
    }
});

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAdminEmails = () => {
    return String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
        .split(/[,;\n]/)
        .map(normalizeEmail)
        .filter(Boolean);
};

const isAdminUser = async (userId) => {
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) {
        return false;
    }

    const [rows] = await db.execute(
        `SELECT email FROM users WHERE id = ?`,
        [userId]
    );

    return adminEmails.includes(normalizeEmail(rows[0]?.email));
};

const canAccessDeal = async (dealId, userId) => {
    const [dealRows] = await db.execute(
        `SELECT id FROM deals WHERE id = ? AND (buyer_id = ? OR seller_id = ?)`,
        [dealId, userId, userId]
    );

    if (dealRows.length > 0) {
        return true;
    }

    return isAdminUser(userId);
};

io.use((socket, next) => {
    try {
        const rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        const token = String(rawToken || "").replace(/^Bearer\s+/i, "");

        if (!token) {
            return next(new Error("Unauthorized"));
        }

        socket.user = jwt.verify(token, "dev-secret");
        next();
    } catch {
        next(new Error("Unauthorized"));
    }
});

io.on('connection', (socket) => {

    socket.on('joinRoom', async (room, callback) => {
        try {
            const match = typeof room === 'string' ? room.match(/^deal-(\d+)$/) : null;
            if (!match) {
                callback?.({ ok: false, message: "Invalid room" });
                return;
            }

            const dealId = Number(match[1]);
            const allowed = await canAccessDeal(dealId, socket.user.userId);
            if (!allowed) {
                callback?.({ ok: false, message: "Access denied" });
                return;
            }

            socket.join(room);
            callback?.({ ok: true });
        } catch (err) {
            console.error('Socket joinRoom error:', err);
            callback?.({ ok: false, message: "Failed to join room" });
        }
    });

    socket.on('leaveRoom', (room) => {
        if (typeof room === 'string') {
            socket.leave(room);
        }
    });

    socket.on('sendMessage', async (payload, callback) => {
        try {
            const { room, message, dealId } = payload || {};
            const normalizedDealId = Number(dealId);
            const text = String(message || "").trim();

            if (!room || !Number.isFinite(normalizedDealId) || normalizedDealId <= 0 || !text) {
                callback?.({ ok: false, message: "Invalid message" });
                return;
            }

            if (room !== `deal-${normalizedDealId}`) {
                callback?.({ ok: false, message: "Invalid room" });
                return;
            }

            const senderId = socket.user.userId;
            const allowed = await canAccessDeal(normalizedDealId, senderId);
            if (!allowed) {
                callback?.({ ok: false, message: "Access denied" });
                return;
            }

            const messageId = uuidv4();

            await db.execute(
                `INSERT INTO messages (id, deal_id, sender_id, text)
         VALUES (?, ?, ?, ?)`,
                [messageId, normalizedDealId, senderId, text]
            );

            const [userRows] = await db.execute(
                `SELECT username FROM users WHERE id = ?`,
                [senderId]
            );

            const sender = {
                id: senderId,
                username: userRows[0]?.username || `user_${senderId}`
            };

            const msg = {
                id: messageId,
                text,
                sender,
                createdAt: new Date().toISOString()
            };

            io.to(room).emit('message', msg);
            callback?.({ ok: true, message: msg });

        } catch (err) {
            console.error('Socket sendMessage error:', err);
            callback?.({ ok: false, message: "Failed to send message" });
        }
    });

});


app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.use("/", otherRoutes);
app.use("/order", auth, orderRoutes);
app.use("/deal", auth, dealsRoutes);
app.use("/api/transactions", auth, apiTransactionRoutes);
app.use("/api/auth", auth, apiAuthRoutes);
app.use("/auth", authRoutes);
app.use("/wallets", auth, walletRoutes);
app.use("/payment-methods", auth, paymentMethodRoutes);
app.use("/message", auth, messageRoutes);
app.use("/support", auth, supportRoutes);
app.use("/referrals", auth, referralRoutes);
app.use("/admin", auth, adminRoutes);
app.use("/exchange", auth, exchangeRoutes);
app.use("/processing", auth, processingRoutes);
app.use("/nft", auth, nftRoutes);



export { app, server, io };
export default app;
