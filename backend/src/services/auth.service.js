import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { signAccessToken } from "../config/jwt.js";
import { generateUserWallets } from "./wallet-generator.service.js";
import { recordLoginIp } from "./login-ip.service.js";

const createUserWallets = async (connection, userId) => {
    const { btc, eth, usdt, trx } = generateUserWallets(userId);

    await connection.query(
        `INSERT INTO wallets (user_id, currency, balance, address, private_key)
         VALUES (?, 'BTC', 0, ?, ?),
                (?, 'ETH', 0, ?, ?),
                (?, 'USDT', 0, ?, ?),
                (?, 'TRX', 0, ?, ?)`,
        [
            userId, btc.address, btc.privateKey,
            userId, eth.address, eth.privateKey,
            userId, usdt.address, usdt.privateKey,
            userId, trx.address, trx.privateKey,
        ]
    );

    return {
        btcAddress: btc.address,
        ethAddress: eth.address,
        usdtAddress: usdt.address,
        trxAddress: trx.address,
    };
};

export async function registerUser(username, email, password) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [exists] = await connection.query(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );

        if (exists.length > 0) {
            throw new Error("Username already exists");
        }

        const hash = await bcrypt.hash(password, 10);

        const [result] = await connection.query(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            [username, email, hash]
        );

        const userId = result.insertId;

        const walletAddresses = await createUserWallets(connection, userId);

        await connection.commit();

        return {
            userId,
            ...walletAddresses,
        };
    } catch (err) {
        await connection.rollback();

        console.error("registerUser failed", {
            code: err.code,
            message: err.message,
        });

        if (err.message === "Username already exists") {
            throw err;
        }

        if (err.code === "ER_DUP_ENTRY") {
            throw new Error("Wallet address already exists. Please try again");
        }

        throw new Error("Failed to create BTC/ETH/USDT/TRX wallets");
    } finally {
        connection.release();
    }
}

export async function registerUserWithReferral(username, email, password, referralCode) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [exists] = await connection.query(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            [username, email]
        );

        if (exists.length > 0) {
            throw new Error("User already exists");
        }

        let referrerId = null;
        const normalizedReferralCode = String(referralCode || "").trim().toUpperCase();

        if (normalizedReferralCode) {
            const [refRows] = await connection.query(
                "SELECT id FROM users WHERE referral_code = ?",
                [normalizedReferralCode]
            );

            if (refRows.length === 0) {
                throw new Error("Referral code not found");
            }

            referrerId = refRows[0].id;
        }

        const hash = await bcrypt.hash(password, 10);

        const [result] = await connection.query(
            "INSERT INTO users (username, email, password_hash, referred_by) VALUES (?, ?, ?, ?)",
            [username, email, hash, referrerId]
        );

        const userId = result.insertId;
        const referral = `GBL${Number(userId).toString(36).toUpperCase().padStart(6, "0")}`;
        await connection.query("UPDATE users SET referral_code = ? WHERE id = ?", [referral, userId]);

        const walletAddresses = await createUserWallets(connection, userId);

        await connection.commit();

        return {
            userId,
            referral,
            ...walletAddresses,
        };
    } catch (err) {
        await connection.rollback();

        console.error("registerUserWithReferral failed", {
            code: err.code,
            message: err.message,
        });

        if (["User already exists", "Referral code not found"].includes(err.message)) {
            throw err;
        }

        if (err.code === "ER_DUP_ENTRY") {
            throw new Error("User or wallet already exists. Please try again");
        }

        throw new Error("Failed to create account and wallets");
    } finally {
        connection.release();
    }
}

export async function getMe(username, password) {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE username = ? AND COALESCE(status, 'active') = 'active'",
        [username]
    );

    if (rows.length === 0) {
        throw new Error("Invalid credentials");
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) throw new Error("Invalid credentials");

    const payload = { userId: user.id, username: user.username, tokenVersion: Number(user.token_version || 0) };
    const token = signAccessToken(payload);

    return token;
}

export async function loginUser(username, password, context) {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE (username = ? OR LOWER(email) = LOWER(?)) AND COALESCE(status, 'active') = 'active' ORDER BY (username = ?) DESC LIMIT 1",
        [username, username, username]
    );

    if (rows.length === 0) {
        throw new Error("Invalid credentials");
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) throw new Error("Invalid credentials");

    await recordLoginIp(db, user.id, context);
    const payload = { userId: user.id, username: user.username, tokenVersion: Number(user.token_version || 0) };
    const token = signAccessToken(payload);

    return token;
}
