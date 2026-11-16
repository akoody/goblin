// Админка: Платёжный процессинг: сделки, реквизиты, транзакции. Маршруты подключает routes/admin.routes.js после проверки прав.
import { db } from "../../config/db.js";

const processingStatuses = new Set(["ACTIVE", "COMPLETED", "CANCELLED", "PAUSED"]);

const processingTransactionStatuses = new Set(["PENDING", "CONFIRMED", "FAILED", "CANCELLED"]);

const processingDirections = new Set(["IN", "OUT"]);

const processingCurrencies = new Set(["USD", "EUR", "RUB"]);

const parseMoney = (value, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
};

const parseProcessingDetails = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const formatProcessingDeal = (row) => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.user_email,
  userUsername: row.user_username,
  title: row.title,
  direction: row.direction,
  fiatCurrency: row.fiat_currency,
  targetAmount: row.target_amount,
  processedAmount: row.processed_amount,
  minTransactionAmount: row.min_transaction_amount,
  maxTransactionAmount: row.max_transaction_amount,
  status: row.status,
  comment: row.comment,
  requisitesCount: Number(row.requisites_count || 0),
  transactionsCount: Number(row.transactions_count || 0),
  pendingTransactionsCount: Number(row.pending_transactions_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
});

const recalculateProcessingDeal = async (connection, dealId) => {
  await connection.execute(
    `UPDATE processing_requisites pr
     SET used_amount = (
       SELECT COALESCE(SUM(pt.amount), 0)
       FROM processing_transactions pt
       WHERE pt.requisite_id = pr.id
         AND pt.status = 'CONFIRMED'
     )
     WHERE pr.deal_id = ?`,
    [dealId]
  );

  await connection.execute(
    `UPDATE processing_deals pd
     SET processed_amount = (
       SELECT COALESCE(SUM(pt.amount), 0)
       FROM processing_transactions pt
       WHERE pt.deal_id = pd.id
         AND pt.status = 'CONFIRMED'
     ),
     status = CASE
       WHEN status IN ('CANCELLED', 'PAUSED') THEN status
       WHEN (
         SELECT COALESCE(SUM(pt.amount), 0)
         FROM processing_transactions pt
         WHERE pt.deal_id = pd.id
           AND pt.status = 'CONFIRMED'
       ) >= target_amount THEN 'COMPLETED'
       ELSE 'ACTIVE'
     END,
     completed_at = CASE
       WHEN status <> 'CANCELLED' AND (
         SELECT COALESCE(SUM(pt.amount), 0)
         FROM processing_transactions pt
         WHERE pt.deal_id = pd.id
           AND pt.status = 'CONFIRMED'
       ) >= target_amount THEN COALESCE(completed_at, NOW())
       ELSE completed_at
     END
     WHERE pd.id = ?`,
    [dealId]
  );
};

export default function register(router) {
router.get("/processing", async (req, res) => {
  try {
    const status = processingStatuses.has(String(req.query.status).toUpperCase())
      ? String(req.query.status).toUpperCase()
      : "";
    const currency = processingCurrencies.has(String(req.query.currency).toUpperCase())
      ? String(req.query.currency).toUpperCase()
      : "";
    const search = String(req.query.search || "").trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = [];
    const params = [];

    if (status) {
      where.push("pd.status = ?");
      params.push(status);
    }
    if (currency) {
      where.push("pd.fiat_currency = ?");
      params.push(currency);
    }
    if (search) {
      where.push(`(CAST(pd.id AS CHAR) = ? OR pd.title LIKE ? OR u.email LIKE ? OR u.username LIKE ?)`);
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [[count]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       ${clause}`,
      params
    );
    const [rows] = await db.execute(
      `SELECT pd.*,
              u.email AS user_email,
              u.username AS user_username,
              COALESCE(prs.requisites_count, 0) AS requisites_count,
              COALESCE(pts.transactions_count, 0) AS transactions_count,
              COALESCE(pts.pending_transactions_count, 0) AS pending_transactions_count
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       LEFT JOIN (
         SELECT deal_id, COUNT(*) AS requisites_count
         FROM processing_requisites
         GROUP BY deal_id
       ) prs ON prs.deal_id = pd.id
       LEFT JOIN (
         SELECT deal_id,
                COUNT(*) AS transactions_count,
                SUM(status = 'PENDING') AS pending_transactions_count
         FROM processing_transactions
         GROUP BY deal_id
       ) pts ON pts.deal_id = pd.id
       ${clause}
       ORDER BY pd.created_at DESC, pd.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[summary]] = await db.execute(
      `SELECT COUNT(*) AS total_deals,
              SUM(status = 'ACTIVE') AS active_deals,
              SUM(status = 'COMPLETED') AS completed_deals,
              COALESCE(SUM(target_amount), 0) AS target_amount,
              COALESCE(SUM(processed_amount), 0) AS processed_amount
       FROM processing_deals`
    );

    res.json({
      items: rows.map(formatProcessingDeal),
      total: Number(count.total || 0),
      limit,
      offset,
      summary: {
        totalDeals: Number(summary.total_deals || 0),
        activeDeals: Number(summary.active_deals || 0),
        completedDeals: Number(summary.completed_deals || 0),
        targetAmount: summary.target_amount,
        processedAmount: summary.processed_amount,
      },
    });
  } catch (err) {
    console.error("GET /admin/processing error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deals" });
  }
});
router.get("/processing/:id", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return res.status(400).json({ message: "Invalid processing deal id" });
    }

    const [dealRows] = await db.execute(
      `SELECT pd.*, u.email AS user_email, u.username AS user_username
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       WHERE pd.id = ?`,
      [dealId]
    );
    if (dealRows.length === 0) {
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const [requisites] = await db.execute(
      `SELECT *
       FROM processing_requisites
       WHERE deal_id = ?
       ORDER BY status = 'ACTIVE' DESC, priority ASC, id DESC`,
      [dealId]
    );
    const [transactions] = await db.execute(
      `SELECT pt.*, pr.label AS requisite_label, u.email AS user_email, u.username AS user_username
       FROM processing_transactions pt
       LEFT JOIN processing_requisites pr ON pr.id = pt.requisite_id
       LEFT JOIN users u ON u.id = pt.user_id
       WHERE pt.deal_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC
       LIMIT 500`,
      [dealId]
    );

    res.json({
      deal: formatProcessingDeal(dealRows[0]),
      requisites: requisites.map((row) => ({ ...row, details: parseProcessingDetails(row.details) })),
      transactions,
    });
  } catch (err) {
    console.error("GET /admin/processing/:id error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deal" });
  }
});
router.post("/processing", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || 0) || null;
    const title = String(req.body?.title || "").trim().slice(0, 160);
    const direction = processingDirections.has(String(req.body?.direction).toUpperCase())
      ? String(req.body.direction).toUpperCase()
      : "IN";
    const fiatCurrency = processingCurrencies.has(String(req.body?.fiatCurrency).toUpperCase())
      ? String(req.body.fiatCurrency).toUpperCase()
      : "RUB";
    const targetAmount = parseMoney(req.body?.targetAmount);
    const minTransactionAmount = parseMoney(req.body?.minTransactionAmount);
    const maxTransactionAmount = parseMoney(req.body?.maxTransactionAmount);
    const comment = String(req.body?.comment || "").trim().slice(0, 1000) || null;

    if (!title || targetAmount <= 0) {
      return res.status(400).json({ message: "Title and target amount are required" });
    }
    if (maxTransactionAmount > 0 && minTransactionAmount > maxTransactionAmount) {
      return res.status(400).json({ message: "Min transaction amount cannot be greater than max" });
    }
    if (userId) {
      const [users] = await db.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
      if (users.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO processing_deals
        (user_id, title, direction, fiat_currency, target_amount, min_transaction_amount,
         max_transaction_amount, comment, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, direction, fiatCurrency, targetAmount, minTransactionAmount, maxTransactionAmount, comment, req.user.userId]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("POST /admin/processing error:", err);
    res.status(500).json({ message: "Failed to create processing deal" });
  }
});
router.patch("/processing/:id", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    const status = processingStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(dealId) || dealId <= 0 || !status) {
      return res.status(400).json({ message: "Invalid processing deal status" });
    }

    await db.execute(
      `UPDATE processing_deals
       SET status = ?,
           completed_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           cancelled_at = CASE WHEN ? = 'CANCELLED' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END
       WHERE id = ?`,
      [status, status, status, dealId]
    );

    res.json({ id: dealId, status });
  } catch (err) {
    console.error("PATCH /admin/processing/:id error:", err);
    res.status(500).json({ message: "Failed to update processing deal" });
  }
});
router.post("/processing/:id/requisites", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    const label = String(req.body?.label || "").trim().slice(0, 160);
    const methodCode = String(req.body?.methodCode || "manual").trim().slice(0, 64) || "manual";
    const limitAmount = parseMoney(req.body?.limitAmount);
    const minTransactionAmount = parseMoney(req.body?.minTransactionAmount);
    const maxTransactionAmount = parseMoney(req.body?.maxTransactionAmount);

    if (!Number.isFinite(dealId) || dealId <= 0 || !label || limitAmount <= 0) {
      return res.status(400).json({ message: "Deal id, label and limit are required" });
    }
    if (maxTransactionAmount > 0 && minTransactionAmount > maxTransactionAmount) {
      return res.status(400).json({ message: "Min transaction amount cannot be greater than max" });
    }

    const [deals] = await db.execute("SELECT fiat_currency FROM processing_deals WHERE id = ? LIMIT 1", [dealId]);
    if (deals.length === 0) {
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const details = req.body?.details && typeof req.body.details === "object" ? req.body.details : {};
    const [result] = await db.execute(
      `INSERT INTO processing_requisites
        (deal_id, method_code, label, holder_name, bank_name, account_number, card_number,
         phone, iban, details, fiat_currency, limit_amount, min_transaction_amount,
         max_transaction_amount, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        methodCode,
        label,
        String(req.body?.holderName || "").trim().slice(0, 160) || null,
        String(req.body?.bankName || "").trim().slice(0, 160) || null,
        String(req.body?.accountNumber || "").trim().slice(0, 255) || null,
        String(req.body?.cardNumber || "").trim().slice(0, 64) || null,
        String(req.body?.phone || "").trim().slice(0, 64) || null,
        String(req.body?.iban || "").trim().slice(0, 64) || null,
        JSON.stringify(details),
        deals[0].fiat_currency,
        limitAmount,
        minTransactionAmount,
        maxTransactionAmount,
        Number(req.body?.priority || 100),
      ]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("POST /admin/processing/:id/requisites error:", err);
    res.status(500).json({ message: "Failed to create processing requisite" });
  }
});
router.patch("/processing/requisites/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = ["ACTIVE", "PAUSED", "DISABLED"].includes(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(id) || id <= 0 || !status) {
      return res.status(400).json({ message: "Invalid requisite status" });
    }
    await db.execute("UPDATE processing_requisites SET status = ? WHERE id = ?", [status, id]);
    res.json({ id, status });
  } catch (err) {
    console.error("PATCH /admin/processing/requisites/:id error:", err);
    res.status(500).json({ message: "Failed to update processing requisite" });
  }
});
router.post("/processing/:id/transactions", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const dealId = Number(req.params.id);
    const requisiteId = Number(req.body?.requisiteId || 0) || null;
    const amount = parseMoney(req.body?.amount);
    const status = processingTransactionStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "PENDING";

    if (!Number.isFinite(dealId) || dealId <= 0 || amount <= 0) {
      return res.status(400).json({ message: "Deal id and amount are required" });
    }

    await connection.beginTransaction();

    const [deals] = await connection.execute(
      `SELECT id, fiat_currency, target_amount, processed_amount, min_transaction_amount, max_transaction_amount
       FROM processing_deals
       WHERE id = ?
       FOR UPDATE`,
      [dealId]
    );
    if (deals.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const deal = deals[0];
    if (Number(deal.min_transaction_amount || 0) > 0 && amount < Number(deal.min_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is below deal min transaction limit" });
    }
    if (Number(deal.max_transaction_amount || 0) > 0 && amount > Number(deal.max_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is above deal max transaction limit" });
    }
    if (status === "CONFIRMED" && Number(deal.processed_amount || 0) + amount > Number(deal.target_amount || 0)) {
      await connection.rollback();
      return res.status(400).json({ message: "Processing deal limit exceeded" });
    }

    if (requisiteId) {
      const [requisites] = await connection.execute(
        `SELECT id, limit_amount, used_amount, min_transaction_amount, max_transaction_amount
         FROM processing_requisites
         WHERE id = ? AND deal_id = ?
         FOR UPDATE`,
        [requisiteId, dealId]
      );
      if (requisites.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Processing requisite not found" });
      }

      const requisite = requisites[0];
      if (Number(requisite.min_transaction_amount || 0) > 0 && amount < Number(requisite.min_transaction_amount)) {
        await connection.rollback();
        return res.status(400).json({ message: "Amount is below requisite min transaction limit" });
      }
      if (Number(requisite.max_transaction_amount || 0) > 0 && amount > Number(requisite.max_transaction_amount)) {
        await connection.rollback();
        return res.status(400).json({ message: "Amount is above requisite max transaction limit" });
      }
      if (status === "CONFIRMED" && Number(requisite.used_amount || 0) + amount > Number(requisite.limit_amount || 0)) {
        await connection.rollback();
        return res.status(400).json({ message: "Requisite limit exceeded" });
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO processing_transactions
        (deal_id, requisite_id, user_id, external_id, amount, fiat_currency, status,
         payer_name, payer_account, proof_url, comment, confirmed_at, failed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        requisiteId,
        Number(req.body?.userId || 0) || null,
        String(req.body?.externalId || "").trim().slice(0, 120) || null,
        amount,
        deal.fiat_currency,
        status,
        String(req.body?.payerName || "").trim().slice(0, 160) || null,
        String(req.body?.payerAccount || "").trim().slice(0, 255) || null,
        String(req.body?.proofUrl || "").trim().slice(0, 500) || null,
        String(req.body?.comment || "").trim().slice(0, 1000) || null,
        status === "CONFIRMED" ? new Date() : null,
        status === "FAILED" ? new Date() : null,
      ]
    );

    await recalculateProcessingDeal(connection, dealId);
    await connection.commit();

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("POST /admin/processing/:id/transactions error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "External transaction id already exists" });
    }
    res.status(500).json({ message: "Failed to create processing transaction" });
  } finally {
    connection.release();
  }
});
router.patch("/processing/transactions/:id", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const id = Number(req.params.id);
    const status = processingTransactionStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(id) || id <= 0 || !status) {
      return res.status(400).json({ message: "Invalid transaction status" });
    }

    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, deal_id, requisite_id, amount, status
       FROM processing_transactions
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Processing transaction not found" });
    }

    if (status === "CONFIRMED" && rows[0].status !== "CONFIRMED") {
      const [[deal]] = await connection.execute(
        `SELECT target_amount, processed_amount
         FROM processing_deals
         WHERE id = ?
         FOR UPDATE`,
        [rows[0].deal_id]
      );
      if (Number(deal?.processed_amount || 0) + Number(rows[0].amount || 0) > Number(deal?.target_amount || 0)) {
        await connection.rollback();
        return res.status(400).json({ message: "Processing deal limit exceeded" });
      }

      if (rows[0].requisite_id) {
        const [[requisite]] = await connection.execute(
          `SELECT limit_amount, used_amount
           FROM processing_requisites
           WHERE id = ?
           FOR UPDATE`,
          [rows[0].requisite_id]
        );
        if (Number(requisite?.used_amount || 0) + Number(rows[0].amount || 0) > Number(requisite?.limit_amount || 0)) {
          await connection.rollback();
          return res.status(400).json({ message: "Requisite limit exceeded" });
        }
      }
    }

    await connection.execute(
      `UPDATE processing_transactions
       SET status = ?,
           confirmed_at = CASE WHEN ? = 'CONFIRMED' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
           failed_at = CASE WHEN ? = 'FAILED' THEN COALESCE(failed_at, NOW()) ELSE failed_at END
       WHERE id = ?`,
      [status, status, status, id]
    );
    await recalculateProcessingDeal(connection, rows[0].deal_id);
    await connection.commit();

    res.json({ id, status });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("PATCH /admin/processing/transactions/:id error:", err);
    res.status(500).json({ message: "Failed to update processing transaction" });
  } finally {
    connection.release();
  }
});
}
