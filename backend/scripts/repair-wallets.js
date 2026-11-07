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

const currencies = ["BTC", "ETH", "USDT", "TRX"];
const summary = { created: 0, repaired: 0, unchanged: 0 };

try {
  const [users] = await db.query("SELECT id FROM users ORDER BY id");

  for (const user of users) {
    const userId = Number(user.id);
    const generated = generateUserWallets(userId);

    for (const currency of currencies) {
      const wallet = generated[currency.toLowerCase()];
      const [rows] = await db.execute(
        "SELECT id, address, private_key FROM wallets WHERE user_id = ? AND currency = ? LIMIT 1",
        [userId, currency]
      );

      if (rows.length === 0) {
        await db.execute(
          "INSERT INTO wallets (user_id, currency, balance, address, private_key) VALUES (?, ?, 0, ?, ?)",
          [userId, currency, wallet.address, wallet.privateKey]
        );
        summary.created += 1;
        continue;
      }

      const current = rows[0];
      const placeholder = !current.private_key || String(current.address || "").startsWith("admin-");

      if (placeholder) {
        await db.execute(
          "UPDATE wallets SET address = ?, private_key = ? WHERE id = ?",
          [wallet.address, wallet.privateKey, current.id]
        );
        summary.repaired += 1;
        continue;
      }

      if (current.address !== wallet.address) {
        throw new Error(`${currency} derivation mismatch for user ${userId}`);
      }

      summary.unchanged += 1;
    }
  }

  console.log(JSON.stringify(summary));
} finally {
  await db.end();
}
