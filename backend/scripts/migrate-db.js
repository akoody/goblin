import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const MIGRATION_LOCK = "goblin:schema-migrations";

const getConfig = () => {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (!user || !password) {
    throw new Error("DB_USER and DB_PASSWORD must be set");
  }

  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user,
    password,
    database: process.env.DB_NAME || "goblin",
    multipleStatements: true,
  };
};

export async function runMigrations() {
  const connection = await mysql.createConnection(getConfig());
  let lockAcquired = false;

  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [MIGRATION_LOCK]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) {
      throw new Error("Could not acquire the database migration lock");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const sqlDirectory = new URL("../sql/", import.meta.url);
    const migrationNames = (await readdir(sqlDirectory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const name of migrationNames) {
      const sql = await readFile(new URL(name, sqlDirectory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const [rows] = await connection.execute(
        "SELECT checksum FROM schema_migrations WHERE name = ?",
        [name]
      );

      if (rows.length > 0) {
        if (rows[0].checksum !== checksum) {
          throw new Error(`Migration ${name} was changed after it was applied`);
        }
        continue;
      }

      await connection.query(sql);
      await connection.execute(
        "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
        [name, checksum]
      );
      console.log(`Applied migration: ${name}`);
    }
  } finally {
    if (lockAcquired) {
      await connection.query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]).catch(() => {});
    }
    await connection.end();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runMigrations().catch((error) => {
    console.error("Database migration failed:", error.message);
    process.exitCode = 1;
  });
}
