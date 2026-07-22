import { db } from "../config/db.js";

export async function getUserWallets(userId) {
    const [rows] = await db.query(
        "SELECT currency, balance FROM wallets WHERE user_id = ?",
        [userId]
    );
    return rows;
}

export async function getWallet(userId, currency) {
    const [rows] = await db.query(
        "SELECT * FROM wallets WHERE user_id = ? AND currency = ?",
        [userId, currency]
    );
    return rows[0];
}

export async function createWallet(userId, currency) {
    await db.query(
        "INSERT INTO wallets (user_id, currency, balance) VALUES (?, ?, 0)",
        [userId, currency]
    );
}

export async function changeBalance(userId, currency, amount) {
    await db.query(
        "UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = ?",
        [amount, userId, currency]
    );
}
