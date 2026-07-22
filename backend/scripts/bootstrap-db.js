import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

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

const db = await mysql.createConnection({
  host: databaseHost,
  user: databaseUser,
  password: databasePassword,
  database,
  multipleStatements: true,
});

const sqlDirectory = new URL("../sql/", import.meta.url);
const migrations = (await readdir(sqlDirectory))
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

for (const migration of migrations) {
  const schema = await readFile(new URL(migration, sqlDirectory), "utf8");
  await db.query(schema);
}

const username = "abushka";
const generatedPassword = randomBytes(18).toString("base64url");
const passwordHash = await bcrypt.hash(generatedPassword, 12);

await db.execute(
  `INSERT INTO users (username, email, password_hash, referral_code, status)
   VALUES (?, ?, ?, 'GBLADMIN', 'active')
   ON DUPLICATE KEY UPDATE
     email = VALUES(email),
     password_hash = VALUES(password_hash),
     status = 'active',
     deposits_enabled = 1,
     withdrawals_enabled = 1,
     internal_transfers_enabled = 1,
     p2p_enabled = 1`,
  [username, adminEmail, passwordHash]
);

const [[admin]] = await db.execute("SELECT id FROM users WHERE username = ?", [username]);
for (const currency of ["BTC", "ETH", "USDT", "TRX"]) {
  await db.execute(
    `INSERT INTO wallets (user_id, currency, address, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE status = 'active'`,
    [admin.id, currency, `admin-${admin.id}-${currency.toLowerCase()}`]
  );
}

await db.end();

console.log(JSON.stringify({ username, password: generatedPassword, email: adminEmail }, null, 2));
