import express from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../config/db.js";

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAdminEmails = () =>
  String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
    .split(/[,;\n]/)
    .map(normalizeEmail)
    .filter(Boolean);

const sanitizeText = (value, maxLength = 5000) =>
  String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);

const sanitizeCategory = (value) => {
  const category = sanitizeText(value, 64).toLowerCase();
  return ["deal", "payment", "wallet", "account", "security", "other"].includes(category)
    ? category
    : "account";
};

const isAdminUser = async (userId) => {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return false;

  const [rows] = await db.execute("SELECT email FROM users WHERE id = ?", [userId]);
  return adminEmails.includes(normalizeEmail(rows[0]?.email));
};

const buildAdminEmailPredicate = (alias, operator = "IN") => {
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    return {
      sql: operator === "IN" ? "1 = 0" : "1 = 1",
      params: [],
    };
  }

  return {
    sql: `LOWER(${alias}.email) ${operator} (${adminEmails.map(() => "?").join(",")})`,
    params: adminEmails,
  };
};

const formatTicket = (row, admin = false) => ({
  id: row.id,
  userId: row.user_id,
  subject: row.subject,
  status: row.status,
  priority: row.priority,
  category: row.category,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  user: {
    id: row.user_id,
    username: row.username,
    email: row.email,
  },
  lastMessage: row.last_message || "",
  unread: Number(admin ? row.operator_unread : row.client_unread || 0),
});

const formatMessage = (row, adminEmails = getAdminEmails()) => ({
  id: row.id,
  text: row.text,
  createdAt: row.created_at,
  sender: {
    id: row.sender_id,
    username: row.username,
    email: row.email,
    role: adminEmails.includes(normalizeEmail(row.email)) ? "operator" : "client",
  },
});

const canAccessTicket = async (ticketId, userId) => {
  const [rows] = await db.execute("SELECT user_id FROM support_tickets WHERE id = ?", [ticketId]);
  if (rows.length === 0) return { allowed: false, ticket: null, admin: false };

  const admin = await isAdminUser(userId);
  return {
    allowed: admin || rows[0].user_id === userId,
    ticket: rows[0],
    admin,
  };
};

const getTicketById = async (ticketId, admin = false) => {
  const clientUnread = buildAdminEmailPredicate("su_client_unread", "IN");
  const operatorUnread = buildAdminEmailPredicate("su_operator_unread", "NOT IN");

  const [rows] = await db.execute(
    `SELECT t.*,
            u.username,
            u.email,
            (
              SELECT sm.text
              FROM support_messages sm
              WHERE sm.ticket_id = t.id
              ORDER BY sm.created_at DESC
              LIMIT 1
            ) AS last_message,
            (
              SELECT COUNT(*)
              FROM support_messages sm_client_unread
              JOIN users su_client_unread ON su_client_unread.id = sm_client_unread.sender_id
              WHERE sm_client_unread.ticket_id = t.id
                AND sm_client_unread.created_at > COALESCE(t.last_client_read_at, '1970-01-01')
                AND ${clientUnread.sql}
            ) AS client_unread,
            (
              SELECT COUNT(*)
              FROM support_messages sm_operator_unread
              JOIN users su_operator_unread ON su_operator_unread.id = sm_operator_unread.sender_id
              WHERE sm_operator_unread.ticket_id = t.id
                AND sm_operator_unread.created_at > COALESCE(t.last_operator_read_at, '1970-01-01')
                AND ${operatorUnread.sql}
            ) AS operator_unread
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = ?`,
    [...clientUnread.params, ...operatorUnread.params, ticketId]
  );

  return rows[0] ? formatTicket(rows[0], admin) : null;
};

router.get("/tickets", async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await isAdminUser(userId);
    const status = sanitizeText(req.query.status, 32);
    const params = [];
    const clientUnread = buildAdminEmailPredicate("su_client_unread", "IN");
    const operatorUnread = buildAdminEmailPredicate("su_operator_unread", "NOT IN");

    let where = admin ? "1=1" : "t.user_id = ?";
    if (!admin) params.push(userId);

    if (status && status !== "all" && ["open", "pending", "closed"].includes(status)) {
      where += " AND t.status = ?";
      params.push(status);
    }

    const [rows] = await db.execute(
      `SELECT t.*,
              u.username,
              u.email,
              (
                SELECT sm.text
                FROM support_messages sm
                WHERE sm.ticket_id = t.id
                ORDER BY sm.created_at DESC
                LIMIT 1
              ) AS last_message,
              (
                SELECT COUNT(*)
                FROM support_messages sm_client_unread
                JOIN users su_client_unread ON su_client_unread.id = sm_client_unread.sender_id
                WHERE sm_client_unread.ticket_id = t.id
                  AND sm_client_unread.created_at > COALESCE(t.last_client_read_at, '1970-01-01')
                  AND ${clientUnread.sql}
              ) AS client_unread,
              (
                SELECT COUNT(*)
                FROM support_messages sm_operator_unread
                JOIN users su_operator_unread ON su_operator_unread.id = sm_operator_unread.sender_id
                WHERE sm_operator_unread.ticket_id = t.id
                  AND sm_operator_unread.created_at > COALESCE(t.last_operator_read_at, '1970-01-01')
                  AND ${operatorUnread.sql}
              ) AS operator_unread
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE ${where}
       ORDER BY FIELD(t.status, 'open', 'pending', 'closed'), t.updated_at DESC`,
      [...clientUnread.params, ...operatorUnread.params, ...params]
    );

    res.json(rows.map((row) => formatTicket(row, admin)));
  } catch (err) {
    console.error("GET /support/tickets error:", err);
    res.status(500).json({ message: "Failed to fetch support tickets" });
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const userId = req.user.userId;
    const subject = sanitizeText(req.body?.subject, 120);
    const category = sanitizeCategory(req.body?.category);
    const text = sanitizeText(req.body?.text);

    if (!subject || !text) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const priority = ["deal", "payment", "security"].includes(category) ? "high" : "normal";
    const [result] = await db.execute(
      `INSERT INTO support_tickets (user_id, subject, category, status, priority, last_client_read_at)
       VALUES (?, ?, ?, 'open', ?, NOW())`,
      [userId, subject, category, priority]
    );

    await db.execute(
      "INSERT INTO support_messages (id, ticket_id, sender_id, text) VALUES (?, ?, ?, ?)",
      [uuidv4(), result.insertId, userId, text]
    );

    const ticket = await getTicketById(result.insertId, false);
    res.status(201).json(ticket);
  } catch (err) {
    console.error("POST /support/tickets error:", err);
    res.status(500).json({ message: "Failed to create support ticket" });
  }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.userId;

    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    const access = await canAccessTicket(ticketId, userId);
    if (!access.allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const ticket = await getTicketById(ticketId, access.admin);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json(ticket);
  } catch (err) {
    console.error("GET /support/tickets/:id error:", err);
    res.status(500).json({ message: "Failed to fetch support ticket" });
  }
});

router.get("/tickets/:id/messages", async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.userId;

    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    const access = await canAccessTicket(ticketId, userId);
    if (!access.allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.execute(
      `UPDATE support_tickets
       SET ${access.admin ? "last_operator_read_at" : "last_client_read_at"} = NOW()
       WHERE id = ?`,
      [ticketId]
    );

    const [rows] = await db.execute(
      `SELECT sm.*, u.username, u.email
       FROM support_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.ticket_id = ?
       ORDER BY sm.created_at ASC`,
      [ticketId]
    );

    res.json(rows.map((row) => formatMessage(row)));
  } catch (err) {
    console.error("GET /support/tickets/:id/messages error:", err);
    res.status(500).json({ message: "Failed to fetch support messages" });
  }
});

router.post("/tickets/:id/messages", async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.userId;
    const text = sanitizeText(req.body?.text);

    if (!Number.isFinite(ticketId) || ticketId <= 0 || !text) {
      return res.status(400).json({ message: "Ticket id and text are required" });
    }

    const access = await canAccessTicket(ticketId, userId);
    if (!access.allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messageId = uuidv4();
    await db.execute(
      "INSERT INTO support_messages (id, ticket_id, sender_id, text) VALUES (?, ?, ?, ?)",
      [messageId, ticketId, userId, text]
    );

    await db.execute(
      `UPDATE support_tickets
       SET status = ?,
           ${access.admin ? "last_operator_read_at" : "last_client_read_at"} = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [access.admin ? "pending" : "open", ticketId]
    );

    const [rows] = await db.execute(
      `SELECT sm.*, u.username, u.email
       FROM support_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.id = ?`,
      [messageId]
    );

    res.status(201).json(formatMessage(rows[0]));
  } catch (err) {
    console.error("POST /support/tickets/:id/messages error:", err);
    res.status(500).json({ message: "Failed to send support message" });
  }
});

router.post("/tickets/:id/reopen", async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.userId;

    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    const access = await canAccessTicket(ticketId, userId);
    if (!access.allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.execute(
      "UPDATE support_tickets SET status = 'open', updated_at = NOW() WHERE id = ?",
      [ticketId]
    );

    res.json(await getTicketById(ticketId, access.admin));
  } catch (err) {
    console.error("POST /support/tickets/:id/reopen error:", err);
    res.status(500).json({ message: "Failed to reopen support ticket" });
  }
});

router.patch("/tickets/:id", async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user.userId;
    const status = sanitizeText(req.body?.status, 32);

    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    if (!["open", "pending", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const admin = await isAdminUser(userId);
    if (!admin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await db.execute(
      "UPDATE support_tickets SET status = ?, last_operator_read_at = NOW(), updated_at = NOW() WHERE id = ?",
      [status, ticketId]
    );

    res.json(await getTicketById(ticketId, true));
  } catch (err) {
    console.error("PATCH /support/tickets/:id error:", err);
    res.status(500).json({ message: "Failed to update support ticket" });
  }
});

export default router;
