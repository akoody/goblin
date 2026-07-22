import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAdminEmails = () => {
  return String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
    .split(/[,;\n]/)
    .map(normalizeEmail)
    .filter(Boolean);
};

const isAdminUser = async (userId) => {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    return false;
  }

  const [rows] = await db.execute("SELECT email FROM users WHERE id = ?", [userId]);
  return adminEmails.includes(normalizeEmail(rows[0]?.email));
};

const canAccessDeal = async (dealId, userId) => {
  const [dealRows] = await db.execute(
    "SELECT id FROM deals WHERE id = ? AND (buyer_id = ? OR seller_id = ?)",
    [dealId, userId, userId]
  );

  if (dealRows.length > 0) {
    return true;
  }

  return isAdminUser(userId);
};

// Get message history for a deal
router.get("/:dealId", async (req, res) => {
  try {
    const dealId = Number(req.params.dealId);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return res.status(400).json({ message: "Invalid deal id" });
    }
    
    const userId = req.user.userId;
    const allowed = await canAccessDeal(dealId, userId);
    if (!allowed) {
        return res.status(403).json({ message: "Access denied or deal not found" });
    }

    const [rows] = await db.execute(
      `SELECT m.id, m.text, m.created_at, m.sender_id, u.username
       FROM messages m
                JOIN users u ON m.sender_id = u.id
       WHERE m.deal_id = ?
       ORDER BY m.created_at ASC`,
      [dealId]
    );

    // Format for frontend expectations (msg.sender.id, msg.sender.username)
    const formattedMessages = rows.map(m => ({
        id: m.id,
        text: m.text,
        createdAt: m.created_at,
        sender: {
            id: m.sender_id,
            username: m.username
        }
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error("GET /message/:dealId error:", err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// Send a message via REST (alternative to Sockets)
router.post("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const dealId = Number(req.body?.dealId);
    const text = String(req.body?.text || "").trim();

    if (!Number.isFinite(dealId) || dealId <= 0 || !text) {
      return res.status(400).json({ message: "dealId and text are required" });
    }

    const allowed = await canAccessDeal(dealId, userId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied or deal not found" });
    }

    const { v4: uuidv4 } = await import('uuid');
    const messageId = uuidv4();

    await db.execute(
      "INSERT INTO messages (id, deal_id, sender_id, text) VALUES (?, ?, ?, ?)",
      [messageId, dealId, userId, text]
    );

    // Get user info for response
    const [userRows] = await db.execute("SELECT username FROM users WHERE id = ?", [userId]);

    const msg = {
      id: messageId,
      text,
      createdAt: new Date().toISOString(),
      sender: {
        id: userId,
        username: userRows[0]?.username || `user_${userId}`
      }
    };

    // Optionally emit to sockets if we want to mix REST send with socket receive
    // (requires importing io, which is complex here, so we skip or rely on sockets for real-time)

    res.status(201).json(msg);
  } catch (err) {
    console.error("POST /message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

export default router;
