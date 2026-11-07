import "dotenv/config";
import mysql from "mysql2/promise";

import { generateUserWallets } from "../src/services/wallet-generator.service.js";

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "goblin",
});

let created = 0;
let repaired = 0;
let unchanged = 0;

try {
  const [users] = await db.query("SELECT id FROM users ORDER BY id");

  for (const user of users) {
    const userId = Number(user.id);
    const { trx, usdt } = generateUserWallets(userId);
    const [usdtRows] = await db.execute(
      "SELECT address FROM wallets WHERE user_id = ? AND currency = 'USDT' LIMIT 1",
      [userId]
    );

    if (usdtRows[0]?.address && !String(usdtRows[0].address).startsWith("admin-") && usdtRows[0].address !== usdt.address) {
      throw new Error(`USDT derivation mismatch for user ${userId}`);
    }

    const [trxRows] = await db.execute(
      "SELECT id, address, private_key FROM wallets WHERE user_id = ? AND currency = 'TRX' LIMIT 1",
      [userId]
    );

    if (trxRows.length === 0) {
      await db.execute(
        "INSERT INTO wallets (user_id, currency, balance, address, private_key) VALUES (?, 'TRX', 0, ?, ?)",
        [userId, trx.address, trx.privateKey]
      );
      created += 1;
      continue;
    }

    const current = trxRows[0];
    const placeholder = !current.private_key || String(current.address || "").startsWith("admin-");

    if (placeholder) {
      await db.execute(
        "UPDATE wallets SET address = ?, private_key = ? WHERE id = ?",
        [trx.address, trx.privateKey, current.id]
      );
      repaired += 1;
      continue;
    }

    if (current.address !== trx.address) {
      throw new Error(`TRX derivation mismatch for user ${userId}`);
    }

    unchanged += 1;
  }

  console.log(JSON.stringify({ created, repaired, unchanged }));
} finally {
  await db.end();
}
