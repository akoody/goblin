import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAdminEmails = () =>
  String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
    .split(/[,;\n]/)
    .map(normalizeEmail)
    .filter(Boolean);

const isAdminUser = async (userId) => {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return false;

  const [rows] = await db.execute("SELECT email FROM users WHERE id = ?", [userId]);
  return adminEmails.includes(normalizeEmail(rows[0]?.email));
};

const sanitizeText = (value, maxLength = 255) =>
  String(value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);

const parseDetails = (details) => {
  if (!details) return {};
  if (typeof details === "object") return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
};

const normalizeDefinitionFields = (fields) => {
  if (!Array.isArray(fields)) {
    return { valid: false, message: "Payment fields must be an array" };
  }

  const normalized = fields.map((field) => {
    const minLength =
      field.minLength === "" || field.minLength === undefined || field.minLength === null
        ? undefined
        : Number(field.minLength);
    const maxLength =
      field.maxLength === "" || field.maxLength === undefined || field.maxLength === null
        ? undefined
        : Number(field.maxLength);

    return {
      key: sanitizeText(field.key, 64),
      label: sanitizeText(field.label || field.key, 120),
      required: field.required !== false,
      minLength,
      maxLength,
      pattern: sanitizeText(field.pattern, 255) || undefined,
      placeholder: sanitizeText(field.placeholder, 120) || undefined,
    };
  });

  if (normalized.length === 0) {
    return { valid: false, message: "At least one payment field is required" };
  }

  for (const field of normalized) {
    if (!field.key || !field.label) {
      return { valid: false, message: "Payment field key and label are required" };
    }

    if (field.minLength !== undefined && (!Number.isFinite(field.minLength) || field.minLength < 0)) {
      return { valid: false, message: `${field.label}: invalid minimum length` };
    }

    if (field.maxLength !== undefined && (!Number.isFinite(field.maxLength) || field.maxLength < 0)) {
      return { valid: false, message: `${field.label}: invalid maximum length` };
    }

    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      return { valid: false, message: `${field.label}: minimum length cannot exceed maximum length` };
    }

    if (field.pattern) {
      try {
        new RegExp(field.pattern);
      } catch {
        return { valid: false, message: `${field.label}: invalid validation pattern` };
      }
    }
  }

  return { valid: true, fields: normalized };
};

const formatMethod = (row) => ({
  id: row.id,
  userId: row.user_id,
  type: row.method_name,
  label: row.label,
  details: parseDetails(row.details),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const formatDefinition = (row) => ({
  id: row.code,
  code: row.code,
  name: row.name,
  shortName: row.short_name,
  group: row.group_name,
  tone: row.tone,
  description: row.description,
  speed: row.speed,
  fields: parseDetails(row.fields),
  active: Boolean(row.active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getActiveDefinition = async (type) => {
  const [definitionRows] = await db.execute(
    "SELECT fields FROM payment_method_definitions WHERE code = ? AND active = 1",
    [type]
  );

  return definitionRows[0] || null;
};

const validateMethodDetails = async (type, details) => {
  const definition = await getActiveDefinition(type);

  if (!definition) {
    return { valid: false, message: "Payment method is not available" };
  }

  const fields = parseDetails(definition.fields);
  const requiredFields = fields.filter((field) => field.required !== false).map((field) => field.key);
  const missingFields = requiredFields.filter((field) => !sanitizeText(details[field], 1000));

  if (missingFields.length > 0) {
    return { valid: false, message: "Payment method details are required" };
  }

  for (const field of fields) {
    const rawValue = details[field.key];
    const value = sanitizeText(rawValue, 1000);

    if (!value && field.required === false) {
      continue;
    }

    if (field.minLength && value.length < Number(field.minLength)) {
      return { valid: false, message: `${field.label || field.key}: minimum length is ${field.minLength}` };
    }

    if (field.maxLength && value.length > Number(field.maxLength)) {
      return { valid: false, message: `${field.label || field.key}: maximum length is ${field.maxLength}` };
    }

    if (field.pattern) {
      try {
        const regexp = new RegExp(field.pattern);
        if (!regexp.test(value)) {
          return { valid: false, message: `${field.label || field.key}: invalid format` };
        }
      } catch {
        return { valid: false, message: `${field.label || field.key}: invalid validation pattern` };
      }
    }
  }

  return { valid: true };
};

const ensureAdmin = async (req, res) => {
  const admin = await isAdminUser(req.user.userId);
  if (!admin) {
    res.status(403).json({ message: "Admin access required" });
    return false;
  }
  return true;
};

router.get("/definitions", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "") === "1";
    const [rows] = await db.execute(
      `SELECT *
       FROM payment_method_definitions
       ${includeInactive ? "" : "WHERE active = 1"}
       ORDER BY sort_order ASC, name ASC`
    );

    res.json(rows.map(formatDefinition));
  } catch (err) {
    console.error("GET /payment-methods/definitions error:", err);
    res.status(500).json({ message: "Failed to fetch payment method definitions" });
  }
});

router.post("/definitions", async (req, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const code = sanitizeText(req.body?.code || req.body?.shortName || req.body?.name, 64)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const name = sanitizeText(req.body?.name, 120);
    const shortName = sanitizeText(req.body?.shortName || name, 32);
    const group = sanitizeText(req.body?.group || "banks", 32);
    const tone = sanitizeText(req.body?.tone || "#21a038", 32);
    const description = sanitizeText(req.body?.description, 500);
    const speed = sanitizeText(req.body?.speed || "обычно 1-10 мин.", 80);
    const normalizedFields = normalizeDefinitionFields(req.body?.fields);

    if (!code || !name) {
      return res.status(400).json({ message: "Code, name and fields are required" });
    }

    if (!normalizedFields.valid) {
      return res.status(400).json({ message: normalizedFields.message });
    }

    await db.execute(
      `INSERT INTO payment_method_definitions
        (code, name, short_name, group_name, tone, description, speed, fields, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [code, name, shortName, group, tone, description, speed, JSON.stringify(normalizedFields.fields)]
    );

    const [rows] = await db.execute("SELECT * FROM payment_method_definitions WHERE code = ?", [code]);
    res.status(201).json(formatDefinition(rows[0]));
  } catch (err) {
    console.error("POST /payment-methods/definitions error:", err);
    res.status(500).json({ message: "Failed to create payment method definition" });
  }
});

router.patch("/definitions/:code", async (req, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const code = sanitizeText(req.params.code, 64);
    const name = sanitizeText(req.body?.name, 120);
    const shortName = sanitizeText(req.body?.shortName || name, 32);
    const group = sanitizeText(req.body?.group || "banks", 32);
    const tone = sanitizeText(req.body?.tone || "#21a038", 32);
    const description = sanitizeText(req.body?.description, 500);
    const speed = sanitizeText(req.body?.speed || "обычно 1-10 мин.", 80);
    const normalizedFields = normalizeDefinitionFields(req.body?.fields);
    const active = req.body?.active === false ? 0 : 1;

    if (!code || !name) {
      return res.status(400).json({ message: "Name and fields are required" });
    }

    if (!normalizedFields.valid) {
      return res.status(400).json({ message: normalizedFields.message });
    }

    const [result] = await db.execute(
      `UPDATE payment_method_definitions
       SET name = ?, short_name = ?, group_name = ?, tone = ?, description = ?, speed = ?, fields = ?, active = ?
       WHERE code = ?`,
      [name, shortName, group, tone, description, speed, JSON.stringify(normalizedFields.fields), active, code]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment method definition not found" });
    }

    const [rows] = await db.execute("SELECT * FROM payment_method_definitions WHERE code = ?", [code]);
    res.json(formatDefinition(rows[0]));
  } catch (err) {
    console.error("PATCH /payment-methods/definitions/:code error:", err);
    res.status(500).json({ message: "Failed to update payment method definition" });
  }
});

router.delete("/definitions/:code", async (req, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const code = sanitizeText(req.params.code, 64);

    if (!code) {
      return res.status(400).json({ message: "Payment method code is required" });
    }

    const [result] = await db.execute("DELETE FROM payment_method_definitions WHERE code = ?", [code]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment method definition not found" });
    }

    res.json({ ok: true, code });
  } catch (err) {
    console.error("DELETE /payment-methods/definitions/:code error:", err);
    res.status(500).json({ message: "Failed to delete payment method definition" });
  }
});

// Get all payment methods for the current user
router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await db.execute(
      "SELECT * FROM user_payment_methods WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    res.json(rows.map(formatMethod));
  } catch (err) {
    console.error("GET /payment-methods error:", err);
    res.status(500).json({ message: "Failed to fetch payment methods" });
  }
});

// Add a new payment method
router.post("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, details, label } = req.body;
    const normalizedDetails = parseDetails(details);

    if (!type || !label) {
      return res.status(400).json({ message: "Payment method details are required" });
    }

    const validation = await validateMethodDetails(type, normalizedDetails);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const [result] = await db.execute(
      "INSERT INTO user_payment_methods (user_id, method_name, details, label) VALUES (?, ?, ?, ?)",
      [userId, type, JSON.stringify(normalizedDetails), label]
    );

    const [rows] = await db.execute(
      "SELECT * FROM user_payment_methods WHERE id = ? AND user_id = ?",
      [result.insertId, userId]
    );

    res.status(201).json(formatMethod(rows[0]));
  } catch (err) {
    console.error("POST /payment-methods error:", err);
    res.status(500).json({ message: "Failed to add payment method" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const id = Number(req.params.id);
    const { type, details, label } = req.body;
    const normalizedDetails = parseDetails(details);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid payment method id" });
    }

    if (!type || !label) {
      return res.status(400).json({ message: "Payment method details are required" });
    }

    const validation = await validateMethodDetails(type, normalizedDetails);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const [result] = await db.execute(
      `UPDATE user_payment_methods
       SET method_name = ?, details = ?, label = ?
       WHERE id = ? AND user_id = ?`,
      [type, JSON.stringify(normalizedDetails), label, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    const [rows] = await db.execute(
      "SELECT * FROM user_payment_methods WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    res.json(formatMethod(rows[0]));
  } catch (err) {
    console.error("PATCH /payment-methods/:id error:", err);
    res.status(500).json({ message: "Failed to update payment method" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    await db.execute(
      "DELETE FROM user_payment_methods WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    res.json({ message: "Payment method deleted" });
  } catch (err) {
    console.error("DELETE /payment-methods/:id error:", err);
    res.status(500).json({ message: "Failed to delete payment method" });
  }
});

export default router;
