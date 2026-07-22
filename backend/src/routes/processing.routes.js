import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

const dealStatuses = new Set(["ACTIVE", "COMPLETED", "PAUSED"]);
const transactionStatuses = new Set(["PENDING"]);

const parseMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const parseDetails = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const formatDeal = (row) => ({
  id: row.id,
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const formatRequisite = (row) => ({
  id: row.id,
  methodCode: row.method_code,
  label: row.label,
  holderName: row.holder_name,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  cardNumber: row.card_number,
  phone: row.phone,
  iban: row.iban,
  details: parseDetails(row.details),
  fiatCurrency: row.fiat_currency,
  limitAmount: row.limit_amount,
  usedAmount: row.used_amount,
  minTransactionAmount: row.min_transaction_amount,
  maxTransactionAmount: row.max_transaction_amount,
  status: row.status,
});

const formatTransaction = (row) => ({
  id: row.id,
  requisiteId: row.requisite_id,
  requisiteLabel: row.requisite_label,
  externalId: row.external_id,
  amount: row.amount,
  fiatCurrency: row.fiat_currency,
  status: row.status,
  payerName: row.payer_name,
  payerAccount: row.payer_account,
  comment: row.comment,
  confirmedAt: row.confirmed_at,
  failedAt: row.failed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getAccessibleDeal = async (executor, dealId, userId, lock = false) => {
  const [rows] = await executor.execute(
    `SELECT *
     FROM processing_deals
     WHERE id = ?
       AND (user_id IS NULL OR user_id = ?)
       AND status IN ('ACTIVE', 'COMPLETED', 'PAUSED')
     ${lock ? "FOR UPDATE" : ""}`,
    [dealId, userId]
  );

  return rows[0] || null;
};

const recalculateDeal = async (connection, dealId) => {
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
     )
     WHERE pd.id = ?`,
    [dealId]
  );
};

router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = dealStatuses.has(String(req.query.status).toUpperCase())
      ? String(req.query.status).toUpperCase()
      : "";
    const search = String(req.query.search || "").trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = ["(pd.user_id IS NULL OR pd.user_id = ?)"];
    const params = [userId];

    if (status) {
      where.push("pd.status = ?");
      params.push(status);
    } else {
      where.push("pd.status IN ('ACTIVE', 'COMPLETED', 'PAUSED')");
    }

    if (search) {
      where.push("(CAST(pd.id AS CHAR) = ? OR pd.title LIKE ?)");
      params.push(search, `%${search}%`);
    }

    const clause = `WHERE ${where.join(" AND ")}`;
    const [[count]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM processing_deals pd
       ${clause}`,
      params
    );
    const [rows] = await db.execute(
      `SELECT pd.*,
              COALESCE(prs.requisites_count, 0) AS requisites_count,
              COALESCE(pts.transactions_count, 0) AS transactions_count
       FROM processing_deals pd
       LEFT JOIN (
         SELECT deal_id, COUNT(*) AS requisites_count
         FROM processing_requisites
         WHERE status = 'ACTIVE'
         GROUP BY deal_id
       ) prs ON prs.deal_id = pd.id
       LEFT JOIN (
         SELECT deal_id, COUNT(*) AS transactions_count
         FROM processing_transactions
         WHERE user_id = ?
         GROUP BY deal_id
       ) pts ON pts.deal_id = pd.id
       ${clause}
       ORDER BY pd.created_at DESC, pd.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId, ...params]
    );

    res.json({
      items: rows.map(formatDeal),
      total: Number(count.total || 0),
      limit,
      offset,
    });
  } catch (err) {
    console.error("GET /processing error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deals" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return res.status(400).json({ message: "Invalid processing deal id" });
    }

    const deal = await getAccessibleDeal(db, dealId, req.user.userId);
    if (!deal) {
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const [requisites] = await db.execute(
      `SELECT *
       FROM processing_requisites
       WHERE deal_id = ?
         AND status = 'ACTIVE'
       ORDER BY priority ASC, id DESC`,
      [dealId]
    );
    const [transactions] = await db.execute(
      `SELECT pt.*, pr.label AS requisite_label
       FROM processing_transactions pt
       LEFT JOIN processing_requisites pr ON pr.id = pt.requisite_id
       WHERE pt.deal_id = ?
         AND pt.user_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC
       LIMIT 200`,
      [dealId, req.user.userId]
    );

    res.json({
      deal: formatDeal(deal),
      requisites: requisites.map(formatRequisite),
      transactions: transactions.map(formatTransaction),
    });
  } catch (err) {
    console.error("GET /processing/:id error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deal" });
  }
});

router.post("/:id/transactions", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const dealId = Number(req.params.id);
    const requisiteId = Number(req.body?.requisiteId || 0);
    const amount = parseMoney(req.body?.amount);
    const status = transactionStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "PENDING";

    if (!Number.isFinite(dealId) || dealId <= 0 || !Number.isFinite(requisiteId) || requisiteId <= 0 || amount <= 0) {
      return res.status(400).json({ message: "Deal, requisite and amount are required" });
    }

    await connection.beginTransaction();

    const deal = await getAccessibleDeal(connection, dealId, req.user.userId, true);
    if (!deal || deal.status !== "ACTIVE") {
      await connection.rollback();
      return res.status(404).json({ message: "Active processing deal not found" });
    }

    if (Number(deal.min_transaction_amount || 0) > 0 && amount < Number(deal.min_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is below deal min transaction limit" });
    }
    if (Number(deal.max_transaction_amount || 0) > 0 && amount > Number(deal.max_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is above deal max transaction limit" });
    }

    const [requisites] = await connection.execute(
      `SELECT *
       FROM processing_requisites
       WHERE id = ?
         AND deal_id = ?
         AND status = 'ACTIVE'
       FOR UPDATE`,
      [requisiteId, dealId]
    );
    const requisite = requisites[0];
    if (!requisite) {
      await connection.rollback();
      return res.status(404).json({ message: "Processing requisite not found" });
    }

    if (Number(requisite.min_transaction_amount || 0) > 0 && amount < Number(requisite.min_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is below requisite min transaction limit" });
    }
    if (Number(requisite.max_transaction_amount || 0) > 0 && amount > Number(requisite.max_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is above requisite max transaction limit" });
    }

    const remainingDeal = Math.max(Number(deal.target_amount || 0) - Number(deal.processed_amount || 0), 0);
    const remainingRequisite = Math.max(Number(requisite.limit_amount || 0) - Number(requisite.used_amount || 0), 0);
    if (amount > remainingDeal || amount > remainingRequisite) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount exceeds remaining limit" });
    }

    const [result] = await connection.execute(
      `INSERT INTO processing_transactions
        (deal_id, requisite_id, user_id, external_id, amount, fiat_currency, status,
         payer_name, payer_account, proof_url, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        requisiteId,
        req.user.userId,
        String(req.body?.externalId || "").trim().slice(0, 120) || null,
        amount,
        deal.fiat_currency,
        status,
        String(req.body?.payerName || "").trim().slice(0, 160) || null,
        String(req.body?.payerAccount || "").trim().slice(0, 255) || null,
        String(req.body?.proofUrl || "").trim().slice(0, 500) || null,
        String(req.body?.comment || "").trim().slice(0, 1000) || null,
      ]
    );

    await recalculateDeal(connection, dealId);
    await connection.commit();

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("POST /processing/:id/transactions error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "External transaction id already exists" });
    }
    res.status(500).json({ message: "Failed to create processing transaction" });
  } finally {
    connection.release();
  }
});

export default router;
