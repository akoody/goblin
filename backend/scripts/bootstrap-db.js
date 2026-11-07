import "dotenv/config";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { generateUserWallets } from "../src/services/wallet-generator.service.js";
import { runMigrations } from "./migrate-db.js";

const database = process.env.DB_NAME || "goblin";
const databaseUser = process.env.DB_USER;
const databasePassword = process.env.DB_PASSWORD;
const databaseHost = process.env.DB_HOST || "127.0.0.1";
const adminEmail = String(process.env.ADMIN_EMAILS || "")
  .split(/[,;\n]/)
  .map((value) => value.trim().toLowerCase())
  .find(Boolean);

if (!databaseUser || !databasePassword || !adminEmail) {
  throw new Error("DB_USER, DB_PASSWORD and ADMIN_EMAILS must be set in backend/.env");
}

const root = await mysql.createConnection({
  user: "root",
  socketPath: "/var/run/mysqld/mysqld.sock",
  multipleStatements: true,
});

const account = `${root.escapeId(databaseUser)}@${root.escape(databaseHost)}`;
await root.query(`CREATE DATABASE IF NOT EXISTS ${root.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await root.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${root.escape(databasePassword)}`);
await root.query(`ALTER USER ${account} IDENTIFIED BY ${root.escape(databasePassword)}`);
await root.query(`GRANT ALL PRIVILEGES ON ${root.escapeId(database)}.* TO ${account}`);
await root.query("FLUSH PRIVILEGES");
await root.end();

await runMigrations();

const db = await mysql.createConnection({
  host: databaseHost,
  user: databaseUser,
  password: databasePassword,
  database,
});
const username = "abushka";
const [existingAdmins] = await db.execute(
  "SELECT id FROM users WHERE username = ? LIMIT 1",
  [username]
);
const generatedPassword = existingAdmins.length === 0
  ? randomBytes(18).toString("base64url")
  : null;
const passwordHash = generatedPassword
  ? await bcrypt.hash(generatedPassword, 12)
  : null;

if (existingAdmins.length === 0) {
  await db.execute(
    `INSERT INTO users (username, email, password_hash, referral_code, status)
     VALUES (?, ?, ?, 'GBLADMIN', 'active')`,
    [username, adminEmail, passwordHash]
  );
} else {
  await db.execute(
    `UPDATE users
     SET email = ?,
         status = 'active',
         deposits_enabled = 1,
         withdrawals_enabled = 1,
         internal_transfers_enabled = 1,
         p2p_enabled = 1
     WHERE username = ?`,
    [adminEmail, username]
  );
}

const [[admin]] = await db.execute("SELECT id FROM users WHERE username = ?", [username]);
const generatedWallets = generateUserWallets(Number(admin.id));
for (const currency of ["BTC", "ETH", "USDT", "TRX"]) {
  const wallet = generatedWallets[currency.toLowerCase()];
  await db.execute(
    `INSERT INTO wallets (user_id, currency, address, private_key, status)
     VALUES (?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       private_key = IF(private_key IS NULL OR address LIKE 'admin-%', VALUES(private_key), private_key),
       address = IF(private_key IS NULL OR address LIKE 'admin-%', VALUES(address), address),
       status = 'active'`,
    [admin.id, currency, wallet.address, wallet.privateKey]
  );
}

await db.end();

console.log(JSON.stringify({
  username,
  password: generatedPassword,
  email: adminEmail,
  created: existingAdmins.length === 0,
}, null, 2));
