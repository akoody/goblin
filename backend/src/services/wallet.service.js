import {
    getWallet,
    createWallet,
    changeBalance
} from "../models/wallet.model.js";

export async function getWallets(userId) {
    const [rows] = await db.query(
        "SELECT currency, balance, status FROM wallets WHERE user_id = ?",
        [userId]
    );

    return rows;
}

export async function deposit(userId, currency, amount) {
    await ensureWallet(userId, currency);

    await db.query(
        "UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = ?",
        [amount, userId, currency]
    );
}


export async function withdraw(userId, currency, amount) {
    const [rows] = await db.query(
        "SELECT balance FROM wallets WHERE user_id = ? AND currency = ?",
        [userId, currency]
    );

    if (rows.length === 0) throw new Error("Wallet not found");

    const wallet = rows[0];

    if (wallet.balance < amount) {
        throw new Error("Insufficient funds");
    }

    await db.query(
        "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND currency = ?",
        [amount, userId, currency]
    );
}

export async function transfer(fromId, toId, currency, amount) {
    await ensureWallet(fromId, currency);
    await ensureWallet(toId, currency);

    const [rows] = await db.query(
        "SELECT balance FROM wallets WHERE user_id = ? AND currency = ?",
        [fromId, currency]
    );

    if (rows[0].balance < amount) {
        throw new Error("Insufficient funds");
    }

    await db.query(
        "UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND currency = ?",
        [amount, fromId, currency]
    );

    await db.query(
        "UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = ?",
        [amount, toId, currency]
    );
}
