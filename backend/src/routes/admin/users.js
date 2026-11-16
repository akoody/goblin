// Админка: Пользователи, регистрации, тикеты поддержки, ограничения. Маршруты подключает routes/admin.routes.js после проверки прав.
import { updateUserControls } from "../../services/user-controls.service.js";
import { nativeCurrencies } from "../../services/wallet-inventory.js";
import { db } from "../../config/db.js";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const formatUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  referralCode: row.referral_code,
  referredBy: row.referred_by,
  createdAt: row.created_at,
  status: row.status || "active",
  depositsEnabled: Boolean(row.deposits_enabled),
  withdrawalsEnabled: Boolean(row.withdrawals_enabled),
  internalTransfersEnabled: Boolean(row.internal_transfers_enabled),
  p2pEnabled: Boolean(row.p2p_enabled),
  nftEnabled: Boolean(row.nft_enabled),
  guarantorEnabled: Boolean(row.guarantor_enabled),
  tradingEnabled: Boolean(row.trading_enabled),
  marketAccountsEnabled: Boolean(row.market_accounts_enabled),
  marketServicesEnabled: Boolean(row.market_services_enabled),
  walletCount: Number(row.wallet_count || 0),
  totalBalanceUsd: Number(row.total_balance_usd || 0),
  walletBalances: row.walletBalances || Object.fromEntries(nativeCurrencies.map(currency => [currency, '0'])),
});

const addWalletBalances = async (rows) => {
  if (!rows.length) return rows;
  const ids = rows.map((row) => Number(row.id));
  const placeholders = ids.map(() => "?").join(",");
  const [walletRows] = await db.execute(
    `SELECT user_id, currency, balance FROM wallets WHERE user_id IN (${placeholders})`,
    ids
  );
  const balancesByUser = new Map(ids.map((id) => [id, Object.fromEntries(nativeCurrencies.map(currency => [currency, '0']))]));
  for (const wallet of walletRows) {
    const balances = balancesByUser.get(Number(wallet.user_id));
    const currency = String(wallet.currency || "").toUpperCase();
    if (balances && currency) balances[currency] = String(wallet.balance ?? "0");
  }
  return rows.map((row) => ({ ...row, walletBalances: balancesByUser.get(Number(row.id)) }));
};

const getTableColumns = async (tableName) => {
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
};

const pushInsertValue = (target, columns, column, value) => {
  if (!columns.has(column)) return;
  target.fields.push(column);
  target.placeholders.push("?");
  target.values.push(value);
};

const pushInsertNow = (target, columns, column) => {
  if (!columns.has(column)) return;
  target.fields.push(column);
  target.placeholders.push("NOW()");
};

export default function register(router) {
router.get("/users", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const params = [];
    let where = "";

    if (search) {
      where = "WHERE u.email LIKE ? OR u.username LIKE ? OR CAST(u.id AS CHAR) = ?";
      params.push(`%${search}%`, `%${search}%`, search);
    }

    const [rows] = await db.execute(
      `SELECT u.id,
              u.username,
              u.email,
              u.referral_code,
              u.referred_by,
              u.created_at,
              COALESCE(u.status, 'active') AS status,
              COALESCE(u.deposits_enabled, 1) AS deposits_enabled,
              COALESCE(u.withdrawals_enabled, 1) AS withdrawals_enabled,
              COALESCE(u.internal_transfers_enabled, 1) AS internal_transfers_enabled,
              u.nft_enabled,u.guarantor_enabled,u.trading_enabled,u.market_accounts_enabled,u.market_services_enabled,
              COALESCE(u.p2p_enabled, 1) AS p2p_enabled,
              COUNT(w.id) AS wallet_count,
              COALESCE(SUM(w.balance * CASE
                WHEN w.currency = 'USDT' THEN 1
                WHEN w.currency = 'TRX' THEN 0.12
                WHEN w.currency = 'BTC' THEN 69000
                WHEN w.currency = 'ETH' THEN 3700
                ELSE 0
              END), 0) AS total_balance_usd
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 300`,
      params
    );

    res.json((await addWalletBalances(rows)).map(formatUser));
  } catch (err) {
    console.error("GET /admin/users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});
router.post("/support/tickets", async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.body?.userId || 0);
    const email = normalizeEmail(req.body?.email);
    const subject = String(req.body?.subject || "").trim().slice(0, 180);
    const category = String(req.body?.category || "general").trim().slice(0, 40);
    const priority = String(req.body?.priority || "normal").trim().slice(0, 20);
    const text = String(req.body?.text || "").trim().slice(0, 4000);

    if ((!Number.isFinite(userId) || userId <= 0) && !email) {
      return res.status(400).json({ message: "User id or email is required" });
    }

    if (!subject || !text) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const userQuery = userId > 0
      ? ["SELECT id, username, email FROM users WHERE id = ? LIMIT 1", [userId]]
      : ["SELECT id, username, email FROM users WHERE LOWER(email) = ? LIMIT 1", [email]];
    const [userRows] = await connection.execute(userQuery[0], userQuery[1]);

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];
    const ticketColumns = await getTableColumns("support_tickets");
    const messageColumns = await getTableColumns("support_messages");

    await connection.beginTransaction();
    transactionStarted = true;

    const ticketInsert = { fields: [], placeholders: [], values: [] };
    pushInsertValue(ticketInsert, ticketColumns, "user_id", user.id);
    pushInsertValue(ticketInsert, ticketColumns, "subject", subject);
    pushInsertValue(ticketInsert, ticketColumns, "category", category);
    pushInsertValue(ticketInsert, ticketColumns, "priority", priority);
    pushInsertValue(ticketInsert, ticketColumns, "status", "pending");
    pushInsertNow(ticketInsert, ticketColumns, "created_at");
    pushInsertNow(ticketInsert, ticketColumns, "updated_at");

    if (!ticketInsert.fields.includes("user_id")) {
      await connection.rollback();
      return res.status(500).json({ message: "support_tickets.user_id column is required" });
    }

    const [ticketResult] = await connection.execute(
      `INSERT INTO support_tickets (${ticketInsert.fields.join(", ")})
       VALUES (${ticketInsert.placeholders.join(", ")})`,
      ticketInsert.values
    );

    const ticketId = ticketResult.insertId;
    const messageInsert = { fields: [], placeholders: [], values: [] };
    pushInsertValue(messageInsert, messageColumns, "ticket_id", ticketId);
    pushInsertValue(messageInsert, messageColumns, "sender_id", req.user.userId);
    pushInsertValue(messageInsert, messageColumns, "sender_role", "operator");
    pushInsertValue(messageInsert, messageColumns, "role", "operator");
    pushInsertValue(messageInsert, messageColumns, "text", text);
    pushInsertValue(messageInsert, messageColumns, "message", text);
    pushInsertValue(messageInsert, messageColumns, "read_by_operator", 1);
    pushInsertValue(messageInsert, messageColumns, "read_by_user", 0);
    pushInsertNow(messageInsert, messageColumns, "created_at");

    if (!messageInsert.fields.includes("ticket_id") || (!messageInsert.fields.includes("text") && !messageInsert.fields.includes("message"))) {
      await connection.rollback();
      return res.status(500).json({ message: "support_messages table has unsupported shape" });
    }

    await connection.execute(
      `INSERT INTO support_messages (${messageInsert.fields.join(", ")})
       VALUES (${messageInsert.placeholders.join(", ")})`,
      messageInsert.values
    );

    await connection.commit();

    res.status(201).json({
      id: ticketId,
      userId: user.id,
      subject,
      category,
      priority,
      status: "pending",
      lastMessage: text,
      unread: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error("POST /admin/support/tickets error:", err);
    res.status(500).json({ message: "Failed to create support ticket" });
  } finally {
    connection.release();
  }
});
router.get("/registrations", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, username, email, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 30`
    );

    res.json(rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      createdAt: row.created_at,
    })));
  } catch (err) {
    console.error("GET /admin/registrations error:", err);
    res.status(500).json({ message: "Failed to fetch registrations" });
  }
});
router.patch("/users/:id/controls", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    await updateUserControls(req.user.userId,id,req.body);

    const [rows] = await db.execute(
      `SELECT u.nft_enabled,u.guarantor_enabled,u.trading_enabled,u.market_accounts_enabled,u.market_services_enabled,u.id,
              u.username,
              u.email,
              u.referral_code,
              u.referred_by,
              u.created_at,
              COALESCE(u.status, 'active') AS status,
              COALESCE(u.deposits_enabled, 1) AS deposits_enabled,
              COALESCE(u.withdrawals_enabled, 1) AS withdrawals_enabled,
              COALESCE(u.internal_transfers_enabled, 1) AS internal_transfers_enabled,
              COALESCE(u.p2p_enabled, 1) AS p2p_enabled,
              COUNT(w.id) AS wallet_count,
              COALESCE(SUM(w.balance * CASE
                WHEN w.currency = 'USDT' THEN 1
                WHEN w.currency = 'TRX' THEN 0.12
                WHEN w.currency = 'BTC' THEN 69000
                WHEN w.currency = 'ETH' THEN 3700
                ELSE 0
              END), 0) AS total_balance_usd
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(formatUser((await addWalletBalances(rows))[0]));
  } catch (err) {
    console.error("PATCH /admin/users/:id/controls error:", err);
    res.status(err.status||500).json({ message: err.status?err.message:"Не удалось обновить доступ пользователя" });
  }
});
}
